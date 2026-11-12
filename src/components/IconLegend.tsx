/* eslint-disable @next/next/no-img-element */
import { CATEGORY_LABEL, KEYWORDS, iconSrc, type KeywordCategory } from "@/lib/keywords";

const SHAPE: Record<KeywordCategory, string> = {
  mireni: "kolečko",
  okamzite: "čtverec",
  status: "barevný trojúhelník",
};

export function IconLegend({ detailed = true }: { detailed?: boolean }) {
  return (
    <div className="space-y-8">
      {(Object.keys(CATEGORY_LABEL) as KeywordCategory[]).map((cat) => (
        <section key={cat}>
          <h2 className="mb-1 font-display text-xl font-bold">{CATEGORY_LABEL[cat]}</h2>
          <p className="mb-3 text-xs text-faint">Tvar ikony: {SHAPE[cat]}</p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {KEYWORDS.filter((k) => k.category === cat).map((k) => (
              <li key={k.key} className="panel flex gap-3 p-3">
                <img src={iconSrc(k.icon)} alt="" className="size-11 shrink-0" />
                <div className="min-w-0 text-sm">
                  <div className="font-bold tracking-wide">
                    {k.key}
                    {k.aliases?.length ? <span className="font-normal text-faint"> / {k.aliases.join(", ")}</span> : null}
                  </div>
                  <p className="text-muted">{k.meaning}</p>
                  {detailed && (
                    <p className="mt-1 text-xs text-faint">
                      {k.hideText ? "Na kartě jen ikona" : "Na kartě ikona i text"}
                      {k.cost && ` · cena ${k.cost}`}
                      {k.legacy?.length ? ` · dříve ${k.legacy.join(", ")}` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
