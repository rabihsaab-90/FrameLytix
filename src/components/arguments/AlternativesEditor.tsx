import { Plus, Trash2 } from 'lucide-react';
import type { ArgumentContent } from '@shared/schemas/project';
import { newId } from '@shared/utilities/ids';
import { Button, IconButton, TextArea, TextInput } from '@/components/common/ui';
import { confirmDialog } from '@/stores/uiStore';
import { removeAlternative, type EditFn } from './argumentOps';

export function AlternativesEditor({ argument, onEdit }: { argument: ArgumentContent; onEdit: EditFn }) {
  const remove = async (id: string, name: string) => {
    const choice = await confirmDialog({
      title: 'Remove alternative?',
      message: `Remove “${name || 'this alternative'}” together with its scores and constraint evaluations?${argument.selectedAlternativeId === id ? ' It is currently selected; the selection will be cleared.' : ''}`,
      confirmLabel: 'Remove alternative',
      danger: true
    });
    if (choice === 'confirm') onEdit((d) => removeAlternative(d, id));
  };
  return (
    <div className="flex flex-col gap-3">
      {argument.alternatives.length === 0 ? (
        <p className="text-xs text-dim">No alternatives yet. An argument needs at least two candidate solutions to compare.</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {argument.alternatives.map((alt, i) => (
          <li key={alt.id} className="grid grid-cols-1 gap-2 rounded-md border border-gunmetal bg-obsidian p-2.5 md:grid-cols-[260px_1fr_auto]">
            <TextInput aria-label={`Name of alternative ${i + 1}`} value={alt.name} onChange={(e) => onEdit((d) => void (d.alternatives[i]!.name = e.target.value))} />
            <TextArea
              minRows={1}
              aria-label={`Description of ${alt.name || `alternative ${i + 1}`}`}
              placeholder="Brief description, key features, how it works"
              value={alt.description}
              onChange={(e) => onEdit((d) => void (d.alternatives[i]!.description = e.target.value))}
            />
            <IconButton icon={Trash2} tone="danger" label={`Remove alternative ${alt.name || i + 1}`} onClick={() => void remove(alt.id, alt.name)} />
          </li>
        ))}
      </ul>
      <div>
        <Button
          size="sm"
          variant="outline"
          icon={Plus}
          onClick={() =>
            onEdit((d) => {
              d.alternatives.push({ id: newId(), name: `Alternative ${d.alternatives.length + 1}`, description: '' });
            })
          }
        >
          Add alternative
        </Button>
      </div>
    </div>
  );
}
