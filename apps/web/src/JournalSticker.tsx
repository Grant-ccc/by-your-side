export function JournalSticker({ kind }: { kind: 'mood' | 'pudding' | 'ticket' }) {
  return (
    <svg className="journal-sticker" viewBox="0 0 96 76" aria-hidden="true">
      {kind === 'mood' ? (
        <>
          <ellipse cx="46" cy="63" rx="27" ry="5" fill="#ad6359" opacity=".14" stroke="none" />
          <path
            d="M21 38q-1-20 23-22 26-3 30 19 4 25-27 27-27 0-26-24z"
            fill="#f5b39b"
            stroke="#b56959"
          />
          <path d="M33 38q3-4 6 0m14 0q3-4 6 0m-15 7q3 4 6 0" stroke="#88453e" />
          <path d="M74 14c-7-8-15 2 0 11 15-9 7-19 0-11" fill="#b64b47" stroke="#a04740" />
          <path d="M14 21v8m-4-4h8" stroke="#ba6d55" />
        </>
      ) : kind === 'pudding' ? (
        <>
          <ellipse cx="47" cy="60" rx="37" ry="10" fill="#fff0db" stroke="#b9715c" />
          <ellipse cx="47" cy="58" rx="29" ry="6" stroke="#e7b18f" />
          <path
            d="M20 48l8-26q5-8 19-8t19 8l8 26q1 10-27 10T20 48z"
            fill="#efb069"
            stroke="#a65a3d"
          />
          <path
            d="M27 27q4-13 20-13 17 0 21 13 1 5-10 4-5 0-7 5-2 4-6 0-3-6-7-4-9 4-11-5z"
            fill="#a9513e"
            stroke="none"
          />
          <path d="M32 24q3-5 12-5m-17 19-2 8" stroke="#ffe5b4" />
          <path d="M37 43v2m20-2v2m-12 3q3 3 6 0" stroke="#754538" />
          <path d="M75 9v12m-6-6h12M17 12v8m-4-4h8" stroke="#c8745a" />
        </>
      ) : (
        <>
          <g transform="rotate(-12 48 41)">
            <path
              d="M13 27h67v8a7 7 0 0 0 0 14v8H13v-8a7 7 0 0 0 0-14z"
              fill="#ef9c89"
              stroke="#a9554a"
            />
            <path d="M61 29v26" stroke="#a9554a" strokeDasharray="3 3" />
            <path d="M25 47h24m-24 4h17" stroke="#ad594b" />
          </g>
          <g transform="rotate(13 53 32)">
            <path
              d="M21 16h65v8a6 6 0 0 0 0 12v8H21v-8a6 6 0 0 0 0-12z"
              fill="#ffe0b9"
              stroke="#a85f47"
            />
            <path d="M68 18v24" stroke="#bd7656" strokeDasharray="3 3" />
            <path d="M46 22l3 5 6 1-4 4 1 6-6-3-5 3 1-6-4-4 6-1z" fill="#c65750" stroke="none" />
          </g>
        </>
      )}
    </svg>
  );
}
