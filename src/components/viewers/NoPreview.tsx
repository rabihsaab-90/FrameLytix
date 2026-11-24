import { ExternalLink, FileBox, FileQuestion } from 'lucide-react';
import { Button, Callout } from '@/components/common/ui';

/** Info panel for files FrameLytix cannot render (native CAD, spreadsheets, unknown types). */
export function NoPreview({
  ext,
  nativeCad,
  onOpenExternal,
  openError
}: {
  ext: string;
  nativeCad: boolean;
  onOpenExternal: () => void;
  openError: string | null;
}) {
  const Icon = nativeCad ? FileBox : FileQuestion;
  const label = ext ? `.${ext}` : 'this';
  return (
    <div className="flex h-full min-h-64 items-center justify-center p-8">
      <div className="flex max-w-lg flex-col items-center gap-3 text-center">
        <Icon size={36} className="text-dim" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-white">Preview not available for {label} files in this version</h3>
        {nativeCad ? (
          <p className="text-xs text-silver">
            FrameLytix does not parse native CAD formats such as DWG, DXF, STEP or SolidWorks files. The file is stored safely in your project folder and can be
            linked to requirements, arguments and calculations like any other asset. To view or edit it, open it in your CAD application.
          </p>
        ) : (
          <p className="text-xs text-silver">
            FrameLytix cannot preview this type of file. It is stored safely in your project folder and can be linked to your records. Open it in the application
            associated with this file type to view it.
          </p>
        )}
        <Button variant="primary" icon={ExternalLink} onClick={onOpenExternal}>
          {nativeCad ? 'Open in native CAD application' : 'Open in default application'}
        </Button>
        <p className="text-2xs text-dim">
          {nativeCad
            ? 'AutoCAD, SolidWorks, FreeCAD or a similar application must be installed and associated with this file type on your computer.'
            : 'An application associated with this file type must be installed on your computer.'}
        </p>
        {openError ? (
          <div className="w-full text-left">
            <Callout tone="amber" title="The file could not be opened">
              {openError}
            </Callout>
          </div>
        ) : null}
      </div>
    </div>
  );
}
