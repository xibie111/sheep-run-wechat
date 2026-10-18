import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type Phaser from 'phaser';
import { residentPanelLayout, RESIDENT_READING_STYLE } from './ResidentPanelLayout';
import { RESIDENT_LETTERS } from './ResidentLetters';
import { displayCanvasText } from '../ui/DisplayCanvasText';
import { paginateMail } from '../ui/MailReader';

describe('resident panel landscape layout', () => {
  it.each([[480, 270], [584, 270], [585, 270], [480, 360]])('keeps every control inside %sx%s and out of the letter body', (width, height) => {
    const layout = residentPanelLayout({ width, height }, { left: 0, right: 0, top: 0, bottom: 0 });
    const { panel } = layout;
    for (const rect of [layout.title, layout.saveNotice, ...layout.residents, ...layout.stages, ...layout.letters, layout.back, layout.lettersButton,
      layout.artButton, layout.brief, layout.group, layout.previous, layout.next, layout.readBody, layout.readTitle, layout.readPage, layout.keep, layout.illustration]) {
      expect(rect.x).toBeGreaterThanOrEqual(panel.x); expect(rect.y).toBeGreaterThanOrEqual(panel.y);
      expect(rect.x + rect.width).toBeLessThanOrEqual(panel.x + panel.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(panel.y + panel.height);
    }
    expect(layout.readBody.y + layout.readBody.height).toBeLessThan(layout.back.y);
    expect(layout.readBody.width).toBe(272);
    expect(layout.readBody.x + layout.readBody.width / 2).toBe(panel.x + panel.width / 2);
    expect(layout.saveNotice.x + layout.saveNotice.width / 2).toBe(panel.x + panel.width / 2);
    expect(layout.saveNotice.y + layout.saveNotice.height).toBeLessThanOrEqual(layout.residents[0].y);
    layout.residentUnread.forEach((rect, index) => {
      const card = layout.residents[index];
      expect(rect.y + rect.height).toBeLessThanOrEqual(card.y + card.height - 3);
      expect(rect.y).toBeGreaterThan(card.y + 90 * layout.residentTextScale + 30);
    });
    expect(layout.stages[2].y + layout.stages[2].height).toBeLessThan(layout.brief.y);
    expect(layout.residents[0].y + layout.residents[0].height).toBeLessThan(layout.back.y);
    expect(layout.lettersButton.x + layout.lettersButton.width).toBeLessThan(layout.artButton.x);
    expect(layout.artButton.x + layout.artButton.width).toBeLessThan(layout.brief.x);
  });

  it('separates wrapped stage names, unread status, hints and buttons below the WeChat capsule', () => {
    const layout = residentPanelLayout({ width: 584, height: 270 }, { left: 13, right: 8, top: 27, bottom: 7 });
    layout.residentUnread.forEach((unread, index) => {
      expect(layout.residents[index].y + 90 * layout.residentTextScale + 30).toBeLessThan(unread.y);
      expect(unread.y + unread.height).toBeLessThan(layout.back.y);
    });
    expect(layout.stageHint.y + layout.stageHint.height).toBeLessThan(layout.stages[0].y);
    expect(layout.stages[2].y + layout.stages[2].height).toBeLessThan(layout.brief.y);
    layout.stages.forEach(stage => expect(stage.height - 8).toBeGreaterThan(12));
  });

  it('keeps the third letter above pagination on a 480x270 screen with capsule insets', () => {
    const layout = residentPanelLayout({ width: 480, height: 270 }, { left: 20, right: 12, top: 40, bottom: 10 });
    for (const letter of layout.letters) expect(letter.height).toBeGreaterThanOrEqual(35);
    expect(layout.letters[2].y + layout.letters[2].height).toBeLessThan(layout.readPage.y);
  });

  it.each(RESIDENT_LETTERS)('keeps $title readable across real-font pages at 480x270', letter => {
    const source = readFileSync(new URL('../../assets/fonts/pasture-display-64.fnt', import.meta.url), 'utf8');
    const chars = Object.fromEntries([...source.matchAll(/<char ([^>]+)\/>/g)].map(([, attributes]) => {
      const values = Object.fromEntries([...attributes.matchAll(/(\w+)="(-?\d+)"/g)].map(([, key, value]) => [key, Number(value)]));
      return [values.id, { ...values, xOffset: values.xoffset, yOffset: values.yoffset, xAdvance: values.xadvance }];
    }));
    const scene = { cache: { bitmapFont: { get: () => ({ data: { size: 64, lineHeight: 64, chars } }) } },
      textures: { get: () => ({ getSourceImage: () => ({}) }) } } as unknown as Phaser.Scene;
    const text = displayCanvasText(scene), { readBody } = residentPanelLayout({ width: 480, height: 270 }, { left: 0, right: 0, top: 0, bottom: 0 });
    const { fontSize, lineHeight, paragraphGap } = RESIDENT_READING_STYLE;
    const pages = paginateMail(letter, value => text.fitFontSize(value, readBody.width, fontSize) >= fontSize, readBody.height, lineHeight, paragraphGap);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat().map(line => line.text).join('')).toBe([...letter.paragraphs, letter.signature].join(''));
    expect(pages.flat().every(line => line.y >= 0 && line.y + line.height <= readBody.height)).toBe(true);
  });
});
