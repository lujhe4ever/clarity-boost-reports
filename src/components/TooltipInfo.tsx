import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function TooltipInfo({
  content,
  label = "Mais informacoes",
}: {
  content: string;
  label?: string;
}) {
  if (!content) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            className="inline-flex h-4 w-4 cursor-help items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-56 text-balance">{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
