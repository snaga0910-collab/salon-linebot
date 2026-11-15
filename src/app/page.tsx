// 動作確認用の画面。お客様もオーナー様もLINEだけで完結するため、
// ここは「動いています」を示すだけでよい。

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          hair salon mina
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
          LINE自動応答システム
        </h1>
      </div>

      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        このシステムは LINE 上で動きます。この画面に操作はありません。
        <br />
        営業時間・メニュー・料金は自動でお答えし、空き状況や予約の変更は
        オーナーへお伝えして、対応が終わるまで記録に残します。
      </p>

      <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
        {[
          ["お客様への返信", "自動（24時間）"],
          ["空き状況", "オーナーへ転送"],
          ["未対応の記録", "対応済みにするまで保持"],
          ["まとめ通知", "毎朝8時台（未対応がある日のみ）"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-4 py-3">
            <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">{v}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
