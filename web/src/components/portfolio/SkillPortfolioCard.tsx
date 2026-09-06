import { Card, CardContent } from "@/components/ui/card";
import LevelBadge from "./LevelBadge";
import ConfidenceIndicator, {
  ConfidenceCaveat,
  normalizeConfidence,
} from "./ConfidenceIndicator";
import OverridePanel from "./OverridePanel";
import { Zap } from "lucide-react";
import { parseLevel } from "@/utils/constants";
import { cn } from "@/lib/utils";
import type { PortfolioSkill, AssessorOverride } from "@/types";

interface SkillPortfolioCardProps {
  skill: PortfolioSkill;
  override?: AssessorOverride;
  onOverrideSaved: (override: AssessorOverride) => void;
}

export default function SkillPortfolioCard({
  skill,
  override,
  onOverrideSaved,
}: SkillPortfolioCardProps) {
  const effectiveLevel = override?.override_level ?? parseLevel(skill.ai_level);
  const confidence = normalizeConfidence(skill.ai_confidence);
  const evidence = skill.evidence ?? [];

  // An assessor who has reviewed the evidence and set a level has made a human
  // judgement. That judgement does not inherit the model's uncertainty, so the
  // provisional treatment is dropped once an override exists.
  const provisional = !override && confidence === "low";

  return (
    <Card className={cn(provisional && "border-rose-200")}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <LevelBadge
              data-testid="card-level"
              level={effectiveLevel}
              className={cn(
                "shrink-0",
                // A level the system cannot stand behind should not look like
                // one it can. The dashed edge is the difference between a
                // measurement and a guess, visible before the words are read.
                provisional && "border border-dashed border-rose-400 opacity-80"
              )}
            />

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="break-words font-semibold">{skill.skill_label}</span>
                {skill.is_discovered && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-600">
                    <Zap className="h-3 w-3" /> Discovered
                  </span>
                )}
                {override && (
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-700">
                    Assessor override
                  </span>
                )}
              </div>

              <ConfidenceIndicator
                confidence={skill.ai_confidence}
                evidenceCount={evidence.length}
              />

              {!override && (
                <ConfidenceCaveat confidence={skill.ai_confidence} className="max-w-prose" />
              )}

              {override && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  AI rated L{parseLevel(skill.ai_level)}; assessor set L{override.override_level}.
                </p>
              )}
            </div>
          </div>

          <div className="shrink-0">
            <OverridePanel skill={skill} existingOverride={override} onSaved={onOverrideSaved} />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evidence from interview
          </span>
          {evidence.length > 0 ? (
            <ul className="space-y-1">
              {evidence.map((quote, i) => (
                <li key={i} className="break-words text-sm text-foreground">
                  • {quote}
                </li>
              ))}
            </ul>
          ) : (
            // An empty gap reads as "nothing to see". The absence of evidence
            // under a level is the most important thing on the card.
            <p className="rounded border border-dashed border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              No supporting quotes were captured for this skill. The level above is not
              evidenced — treat it as unassessed.
            </p>
          )}
        </div>

        {skill.competency_summary && (
          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Competency summary
            </span>
            <p className="break-words text-sm leading-relaxed text-muted-foreground">
              {skill.competency_summary}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
