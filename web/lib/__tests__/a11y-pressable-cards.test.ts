import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// #656 (WCAG 4.1.2 Name, Role, Value) — HeroUI renders `<Card isPressable>` as a
// <button>. A button inside a button is invalid HTML: a screen reader announces
// the card as one button and the inner controls (Edit, Delete…) cannot be
// reached. Make the name the "open" button, stretched over the card with an
// `after:absolute after:inset-0` overlay (see InventoryCard, CellarDashboard).
// This guard fails when a pressable card contains an interactive control.

const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components'];
const INTERACTIVE = /<(Button|button|Checkbox|Switch|Link|a|input|Select|Tooltip)\b/;

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(full);
    return /\.tsx$/.test(e.name) ? [full] : [];
  });
}

/** The inner text of each `<Card … isPressable …>…</Card>` of a source. */
export function pressableCardBodies(src: string): string[] {
  const bodies: string[] = [];
  const tag = /<Card\b|<\/Card>/g;
  for (const open of src.matchAll(/<Card\b[^>]*?\bisPressable\b/g)) {
    let depth = 0;
    tag.lastIndex = open.index;
    for (let m = tag.exec(src); m; m = tag.exec(src)) {
      depth += m[0] === '</Card>' ? -1 : 1;
      if (depth === 0) {
        bodies.push(src.slice(open.index, m.index));
        break;
      }
    }
  }
  return bodies;
}

describe('pressable cards contain no other control (#656)', () => {
  const files = DIRS.flatMap((d) => sources(path.join(ROOT, d)));

  it('finds the source files and the pressable cards', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.flatMap((f) => pressableCardBodies(fs.readFileSync(f, 'utf8'))).length).toBeGreaterThan(0);
  });

  it('has no isPressable Card that renders a Button, a link or another control', () => {
    const offenders = files
      .filter((file) => pressableCardBodies(fs.readFileSync(file, 'utf8')).some((body) => INTERACTIVE.test(body)))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'));
    expect(offenders).toEqual([]);
  });

  it('catches a Button nested in a pressable card', () => {
    const bad = '<Card isPressable onPress={go}><CardBody><Button isIconOnly>x</Button></CardBody></Card>';
    expect(pressableCardBodies(bad).some((b) => INTERACTIVE.test(b))).toBe(true);
    const ok = '<Card><CardBody><button type="button">x</button></CardBody></Card><Card isPressable><CardBody>y</CardBody></Card>';
    expect(pressableCardBodies(ok).some((b) => INTERACTIVE.test(b))).toBe(false);
  });
});
