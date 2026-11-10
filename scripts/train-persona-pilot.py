"""Run a small, offline LoRA preference pilot using local, synthetic dialogues."""

import argparse
import json
import math
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, GenerationConfig


SYSTEM = "你在用微信和熟悉的恋人聊天。你扮演李泽言。直接回复她刚说的话，只使用对话里已知的细节。"
MAX_NEW_TOKENS = 40


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def encode_path(tokenizer, inputs, replies):
    messages = [{"role": "system", "content": SYSTEM}]
    spans = []
    for user, reply in zip(inputs, replies, strict=True):
        messages.append({"role": "user", "content": user})
        prefix = tokenizer.apply_chat_template(messages, add_generation_prompt=True)
        messages.append({"role": "assistant", "content": reply})
        completed = tokenizer.apply_chat_template(messages)
        if completed[:len(prefix)] != prefix:
            raise ValueError("The assistant prefix does not match the model's chat template")
        spans.append((len(prefix), len(completed)))
    ids = torch.tensor([completed], dtype=torch.long)
    assistant_mask = torch.zeros(len(completed), dtype=torch.bool)
    for start, end in spans:
        assistant_mask[start:end] = True
    return ids, assistant_mask


def score(model, path):
    ids, assistant_mask = path
    target = assistant_mask[1:]
    logits = model(input_ids=ids, use_cache=False).logits[0, :-1][target]
    target_ids = ids[0, 1:][target].unsqueeze(1)
    return logits.float().log_softmax(-1).gather(1, target_ids).sum()


@torch.inference_mode()
def sample(model, tokenizer, holdout):
    model.eval()
    generation = GenerationConfig(max_new_tokens=MAX_NEW_TOKENS, do_sample=False,
                                  eos_token_id=tokenizer.eos_token_id,
                                  pad_token_id=tokenizer.pad_token_id)
    replies = {}
    for item in holdout:
        messages = [{"role": "system", "content": SYSTEM}]
        replies[item["id"]] = []
        for user in item["user"]:
            messages.append({"role": "user", "content": user})
            batch = tokenizer.apply_chat_template(messages, add_generation_prompt=True,
                                                  return_tensors="pt", return_dict=True)
            tokens = model.generate(**batch, generation_config=generation)[0, batch.input_ids.shape[1]:]
            reply = tokenizer.decode(tokens, skip_special_tokens=True).strip()
            replies[item["id"]].append({
                "text": reply,
                "reachedTokenLimit": tokens.numel() == MAX_NEW_TOKENS
                and tokens[-1].item() != tokenizer.eos_token_id,
            })
            messages.append({"role": "assistant", "content": reply})
    return replies


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--pairs", required=True, type=Path)
    parser.add_argument("--holdout", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    pairs = read_json(args.pairs)["pairs"]
    holdout = read_json(args.holdout)
    if not pairs or not holdout or {u for pair in pairs for u in pair["user"]} & {
        u for item in holdout for u in item["user"]
    }:
        raise ValueError("The pilot requires separate training and holdout inputs")
    args.output.mkdir(parents=True, exist_ok=False)
    torch.manual_seed(42)
    torch.set_num_threads(4)

    tokenizer = AutoTokenizer.from_pretrained(args.model_dir, local_files_only=True)
    base = AutoModelForCausalLM.from_pretrained(args.model_dir, local_files_only=True,
                                               use_safetensors=True, dtype=torch.float32)
    model = get_peft_model(base, LoraConfig(task_type="CAUSAL_LM", target_modules=["q_proj", "v_proj"],
                                           r=4, lora_alpha=8, lora_dropout=0))
    paths = [(encode_path(tokenizer, p["user"], p["preferred"]),
              encode_path(tokenizer, p["user"], p["lessPreferred"])) for p in pairs]

    model.eval()
    with torch.no_grad(), model.disable_adapter():
        reference = [(score(model, chosen) - score(model, rejected)).item() for chosen, rejected in paths]
        before = sample(model, tokenizer, holdout)
    print("Baseline complete", flush=True)

    trainable = [parameter for parameter in model.parameters() if parameter.requires_grad]
    optimizer = torch.optim.AdamW(trainable, lr=0.001)
    losses = []
    model.train()
    for step in range(8):
        index = step % len(paths)
        chosen, rejected = paths[index]
        optimizer.zero_grad(set_to_none=True)
        delta = score(model, chosen) - score(model, rejected) - reference[index]
        loss = -torch.nn.functional.logsigmoid(0.1 * delta)
        if not math.isfinite(loss.item()):
            raise RuntimeError("Non-finite preference loss")
        loss.backward()
        optimizer.step()
        losses.append(loss.item())
        print(f"step {step + 1}/8 loss={loss.item():.4f}", flush=True)

    model.eval()
    with torch.no_grad():
        trained = [(score(model, chosen) - score(model, rejected)).item() for chosen, rejected in paths]
    if not any(torch.count_nonzero(parameter).item() for name, parameter in model.named_parameters()
               if "lora_B" in name and parameter.requires_grad):
        raise RuntimeError("No LoRA output weights were updated")
    model.save_pretrained(args.output / "adapter", safe_serialization=True)
    after = sample(model, tokenizer, holdout)
    report = {
        "steps": len(losses),
        "trainableParameters": sum(p.numel() for p in trainable),
        "losses": losses,
        "preferenceMargins": {
            pair["id"]: {"before": initial, "after": final}
            for pair, initial, final in zip(pairs, reference, trained, strict=True)
        },
        "holdout": [
            {**item, "before": before[item["id"]], "after": after[item["id"]]} for item in holdout
        ],
    }
    (args.output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("steps", "trainableParameters", "preferenceMargins")}), flush=True)


if __name__ == "__main__":
    main()
