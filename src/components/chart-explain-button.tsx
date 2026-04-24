import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getActiveHotelId } from "@/lib/hotel";
import { sendAssistantMessage } from "@/server/assistant.functions";

export function ChartExplainButton({
  prompt,
  label = "Explain this chart",
  size = "sm",
  align = "start",
  answerTitle,
}: {
  /** Plain-language prompt with the chart's specific numbers. */
  prompt: string;
  label?: string;
  size?: "xs" | "sm";
  align?: "start" | "end";
  /** Small heading shown above the AI answer (e.g. "Sera on Electricity"). */
  answerTitle?: string;
}) {
  const send = useServerFn(sendAssistantMessage);
  const [pending, setPending] = React.useState(false);
  const [answer, setAnswer] = React.useState<string | null>(null);

  async function explain() {
    if (pending) return;
    setPending(true);
    setAnswer(null);
    try {
      const res = await send({
        data: {
          message: prompt,
          hotelId: getActiveHotelId(),
          history: [],
        },
      });
      if (res.ok) setAnswer(res.content);
      else toast.error(res.error);
    } catch {
      toast.error("Couldn't reach Sera. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const padding = size === "xs" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs";

  return (
    <div className={`flex flex-col gap-2 ${align === "end" ? "items-end" : "items-start"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => void explain()}
          disabled={pending}
          className={`${padding} rounded-full border border-foreground/20 bg-foreground font-medium text-background shadow-sm hover:bg-foreground/90 disabled:opacity-70`}
        >
          {pending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Sera is reading…
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {label}
            </>
          )}
        </Button>
        {answer && !pending && (
          <button
            type="button"
            onClick={() => setAnswer(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {answer && (
        <div className="w-full rounded-2xl border border-primary/25 bg-primary/5 p-3.5">
          {answerTitle && (
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              {answerTitle}
            </div>
          )}
          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5">
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
