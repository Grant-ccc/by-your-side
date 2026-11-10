package app.byourside.companion;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "ChatExport")
public class ChatExportPlugin extends Plugin {
    @PluginMethod public void save(PluginCall call) {
        String name = call.getString("name", "");
        if (!name.matches("在你身边-聊天记录-\\d{4}-\\d{2}-\\d{2}\\.txt") || call.getString("text") == null) {
            call.reject("聊天导出格式不正确。");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(call, intent, "saveResult");
        } catch (Exception error) {
            call.reject("无法打开系统的文件保存界面。");
        }
    }

    @ActivityCallback private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK) {
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        Uri target = result.getData() == null ? null : result.getData().getData();
        if (target == null) {
            call.reject("系统没有返回可写入的位置。");
            return;
        }
        getBridge().execute(() -> {
            try (OutputStreamWriter writer = new OutputStreamWriter(
                    getContext().getContentResolver().openOutputStream(target, "wt"), StandardCharsets.UTF_8)) {
                writer.write(call.getString("text", ""));
            } catch (Exception error) {
                call.reject("无法写入聊天记录，请选择其他位置后重试。");
                return;
            }
            response.put("saved", true);
            call.resolve(response);
        });
    }
}
