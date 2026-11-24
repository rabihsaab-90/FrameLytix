/** Pure helpers for the onboarding wizard (kept free of React so they are easy to test). */
import { BRANDING } from '@/config/branding';

/** 'Pedestrian Truss Bridge' -> 'PTB-2026'. Returns '' when the title has no usable characters. */
export function suggestIdentifier(title: string, year: number = new Date().getFullYear()): string {
  const words = (title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const initials = words.length === 1 ? (words[0] ?? '').slice(0, 3) : words.slice(0, 5).map((w) => w.charAt(0)).join('');
  return `${initials.toUpperCase()}-${year}`;
}

interface TreeNode {
  name: string;
  isFile: boolean;
  children: TreeNode[];
}

function insertPath(nodes: TreeNode[], segments: string[]): void {
  const [head, ...rest] = segments;
  if (!head) return;
  let node = nodes.find((n) => n.name === head && !n.isFile);
  if (!node) {
    node = { name: head, isFile: false, children: [] };
    nodes.push(node);
  }
  insertPath(node.children, rest);
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name));
  for (const n of nodes) sortNodes(n.children);
}

function renderNodes(nodes: TreeNode[], prefix: string, out: string[]): void {
  nodes.forEach((n, i) => {
    const last = i === nodes.length - 1;
    out.push(`${prefix}${last ? '└── ' : '├── '}${n.name}${n.isFile ? '' : '/'}`);
    renderNodes(n.children, `${prefix}${last ? '    ' : '│   '}`, out);
  });
}

/** Builds the lines of the "what will be created" tree for a project folder. */
export function buildTreeLines(rootName: string, folders: string[]): string[] {
  const dirs: TreeNode[] = [];
  for (const f of folders) insertPath(dirs, f.split('/').filter(Boolean));
  sortNodes(dirs);
  const meta: TreeNode = {
    name: BRANDING.metadataDirName,
    isFile: false,
    children: [{ name: BRANDING.backupsDirName, isFile: false, children: [] }]
  };
  const top: TreeNode[] = [{ name: BRANDING.manifestFileName, isFile: true, children: [] }, ...dirs, meta];
  const lines = [`${rootName}/`];
  renderNodes(top, '', lines);
  return lines;
}
