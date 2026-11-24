/**
 * Strongly typed engineering template definitions. Templates are pure data used by
 * the onboarding wizard (renderer) and project creation (main process).
 * Keep this file free of React and Node.js imports.
 */
import type {
  Discipline,
  Priority,
  RequirementClassification,
  RequirementSection,
  ReviewCategory,
  VerificationMethod
} from '../../shared/schemas/project';

export interface DisciplineInfo {
  id: Discipline;
  name: string;
  description: string;
  /** lucide-react icon name, resolved in the renderer. */
  icon: string;
}

export interface TemplateRequirement {
  section: RequirementSection;
  category: string;
  title: string;
  description: string;
  classification: RequirementClassification;
  priority: Priority;
  verificationMethod: VerificationMethod;
  /** Editable, non-binding suggestion. Never a fabricated code limit. */
  acceptanceCriterion: string;
  unit?: string;
}

export interface TemplateCriterion {
  name: string;
  /** Percentage weight. Each template argument's weights should total 100. */
  weight: number;
  description?: string;
}

export interface TemplateArgument {
  title: string;
  problemStatement: string;
  objective: string;
  /** Suggested alternatives to evaluate (names only; users add detail). */
  alternatives: string[];
  /** Decision criteria; defaults to Cost / Safety or Strength / Feasibility when omitted. */
  criteria?: TemplateCriterion[];
}

export interface TemplateCalculation {
  title: string;
  purpose: string;
  /** LaTeX equation, e.g. "\\sigma = \\frac{F}{A}". */
  equation: string;
}

export interface TemplateReviewItem {
  category: ReviewCategory;
  text: string;
}

export interface ProjectTemplate {
  /** Unique, stable, kebab-case, e.g. "civil-bridge". Never change once published. */
  id: string;
  discipline: Discipline;
  archetype: string;
  description: string;
  /** Semantic version of this template's content. */
  version: string;
  /** lucide-react icon name. */
  icon: string;
  sectionLabels: { criteria: string; constraints: string; environment: string };
  /**
   * Project-relative folders (POSIX, no leading slash). Must include the four phase
   * roots: 01-Scope-and-Requirements, 02-Engineering-Arguments,
   * 03-CAD-and-Technical-Drawings, 04-Design-Review-and-Export.
   */
  folders: string[];
  /** Default destination for imported drawings, one of `folders`. */
  defaultAssetFolder: string;
  requirementCategories: string[];
  suggestedRequirements: TemplateRequirement[];
  suggestedArguments: TemplateArgument[];
  calculationTypes: TemplateCalculation[];
  deliverables: string[];
  riskCategories: string[];
  reviewChecklist: TemplateReviewItem[];
  designConsiderations: string[];
}

export const PHASE_FOLDERS = [
  '01-Scope-and-Requirements',
  '02-Engineering-Arguments',
  '03-CAD-and-Technical-Drawings',
  '04-Design-Review-and-Export'
] as const;
