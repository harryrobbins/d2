import { test, expect } from '@playwright/test';

async function rendered(page) {
  await expect(page.locator('#status')).toHaveText('Rendered with TALA');
  await expect(page.locator('#diagram-stage > svg')).toBeVisible();
  await expect(page.locator('#download')).toBeEnabled();
}

async function replaceSource(page, source) {
  await page.getByRole('textbox', { name: 'Diagram source' }).fill(source);
}

test('converts Mermaid, lays out real nodes, exposes D2, and exports an SVG', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('API gateway');
  await expect(page.locator('#metrics')).toContainText('nodes');
  await page.getByRole('button', { name: 'View D2' }).click();
  await expect(page.locator('#converted-source')).toContainText('visitor: Visitor');
  await expect(page.locator('#converted-source')).toContainText('Application services');
  await page.getByRole('button', { name: 'Close D2 source' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('mermaid2-diagram.svg');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const svg = Buffer.concat(chunks).toString();
  expect(svg).toContain('<svg');
  expect(svg).toContain('API gateway');
  expect(svg).not.toMatch(/<script\b/i);
  expect(errors).toEqual([]);
});

test('keeps separate language drafts, persists them, and supports manual rendering', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  await page.getByLabel('Live preview').uncheck();
  await replaceSource(page, 'flowchart LR\n  A[Mermaid draft] --> B[Destination]');
  await expect(page.locator('#status')).toContainText('preview out of date');
  await expect(page.locator('#diagram-stage')).not.toContainText('Mermaid draft');
  await page.getByRole('textbox', { name: 'Diagram source' }).press('ControlOrMeta+Enter');
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('Mermaid draft');
  await page.getByRole('button', { name: 'D2', exact: true }).click();
  await rendered(page);
  await replaceSource(page, 'a: D2 draft\nb: Other node\na -> b');
  await page.getByRole('button', { name: 'Render diagram' }).click();
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('D2 draft');
  await page.getByRole('button', { name: 'Mermaid', exact: true }).click();
  await rendered(page);
  await expect(page.getByRole('textbox', { name: 'Diagram source' })).toContainText('Mermaid draft');
  await page.reload();
  await rendered(page);
  await expect(page.getByRole('textbox', { name: 'Diagram source' })).toContainText('Mermaid draft');
  await expect(page.getByLabel('Live preview')).not.toBeChecked();
  await page.getByRole('button', { name: 'D2', exact: true }).click();
  await rendered(page);
  await expect(page.getByRole('textbox', { name: 'Diagram source' })).toContainText('D2 draft');
});

test('renders the examples in both languages, including labeled edges and sequences', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  for (const language of ['Mermaid', 'D2']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    await rendered(page);
    for (const example of ['decision', 'sequence', 'architecture']) {
      await page.getByLabel('Load an example').selectOption(example);
      await rendered(page);
      await expect(page.locator('#error')).toBeHidden();
      const label = example === 'decision' ? 'Valid input?' : example === 'sequence' ? 'Account details' : 'API gateway';
      await expect(page.locator('#diagram-stage')).toContainText(label);
    }
  }
});

test('reports unsupported Mermaid and invalid D2, preserves the previous preview, and recovers', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  await replaceSource(page, 'pie title Pets\n  "Dogs" : 12\n  "Cats" : 10');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('unsupported');
  await expect(page.locator('#diagram-stage')).toContainText('API gateway');
  await expect(page.locator('#download')).toBeDisabled();
  await replaceSource(page, 'flowchart LR\n  recovered[Recovered] --> ok[OK]');
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('Recovered');
  await page.getByRole('button', { name: 'D2', exact: true }).click();
  await rendered(page);
  await replaceSource(page, 'a: {');
  await expect(page.locator('#error')).toBeVisible();
  await expect(page.locator('#error-message')).not.toBeEmpty();
  await replaceSource(page, 'a: Working again\na -> b');
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('Working again');
  await replaceSource(page, '');
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.locator('#diagram-stage > svg')).toHaveCount(0);
});

test('zooms, fits, changes palette, and handles fast edits without stale results', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('#zoom-value')).toHaveText('120%');
  await page.getByRole('button', { name: 'Fit diagram to canvas' }).click();
  await expect(page.locator('#zoom-value')).toHaveText('100%');
  await page.getByLabel('Palette').selectOption('103');
  await rendered(page);
  await page.getByLabel('Sketch', { exact: true }).check();
  await rendered(page);
  await replaceSource(page, 'flowchart LR\n A[Old result] --> B');
  await page.waitForTimeout(600); // Let the old request start before replacing it.
  await replaceSource(page, 'flowchart LR\n A[Latest result] --> B');
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('Latest result');
  await expect(page.locator('#diagram-stage')).not.toContainText('Old result');
});

test('stacks the editor and canvas on mobile without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await rendered(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const source = await page.locator('.source-panel').boundingBox();
  const preview = await page.locator('.preview-panel').boundingBox();
  expect(preview.y).toBeGreaterThan(source.y + source.height - 1);
  await page.getByRole('button', { name: 'About this playground' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('accepts pasted fences and frontmatter and preserves explicit vertical flow', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  await replaceSource(page, '```mermaid\n---\nconfig:\n  layout: elk\n---\n%%{init: {"theme": "dark"}}%%\nflowchart TB\n  A[From a fence] --> B[Still TALA]\n```');
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('From a fence');
  await page.getByRole('button', { name: 'View D2' }).click();
  await expect(page.locator('#converted-source')).toContainText('direction: down');
  await expect(page.locator('#converted-source')).not.toContainText('layout: elk');
  await page.getByRole('button', { name: 'Close D2 source' }).click();
  await page.getByRole('button', { name: 'D2', exact: true }).click();
  await rendered(page);
  await replaceSource(page, '```d2\na: D2 from a fence\na -> b\n```');
  await rendered(page);
  await expect(page.locator('#diagram-stage')).toContainText('D2 from a fence');
});

test('converts the other advertised Mermaid families through the real renderer', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  const samples = [
    ['stateDiagram-v2\n  [*] --> Waiting\n  Waiting --> Complete', 'Waiting'],
    ['classDiagram\n  class Account {\n    +String name\n    +login()\n  }\n  Account --> Session', 'Account'],
    ['erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    int id PK\n    string name\n  }', 'CUSTOMER'],
    ['mindmap\n  root((Roadmap))\n    Build\n    Ship', 'Roadmap'],
    ['C4Context\n  Person(user, "Customer", "Uses the app")\n  System(app, "Application", "Processes orders")\n  Rel(user, app, "Uses")', 'Customer'],
  ];
  for (const [source, label] of samples) {
    await replaceSource(page, source);
    await rendered(page);
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('#diagram-stage')).toContainText(label);
  }
});


test('switches between all layout engines and persists the selection', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  for (const layout of ['dagre', 'elk', 'tala']) {
    await page.getByLabel('Layout', { exact: true }).selectOption(layout);
    await expect(page.locator('#status')).toHaveText(`Rendered with ${layout === 'tala' ? 'TALA' : layout === 'elk' ? 'ELK' : 'Dagre'}`);
    await expect(page.locator('#error')).toBeHidden();
    await expect(page.locator('#diagram-stage')).toContainText('API gateway');
  }
  await page.getByLabel('Layout', { exact: true }).selectOption('elk');
  await expect(page.locator('#status')).toHaveText('Rendered with ELK');
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Rendered with ELK');
  await expect(page.getByLabel('Layout', { exact: true })).toHaveValue('elk');
});

test('renders the complete gallery with TALA in every available input language', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await rendered(page);
  for (const language of ['Mermaid', 'D2']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    await rendered(page);
    const keys = await page.locator('#example option').evaluateAll(options => options.map(o => o.value).filter(Boolean));
    expect(keys.length).toBe(language === 'D2' ? 14 : 12);
    for (const key of keys) {
      await page.getByLabel('Load an example').selectOption(key);
      await expect(page.locator('#status'), `${language}: ${key}`).toHaveText('Rendered with TALA');
      await expect(page.locator('#error'), `${language}: ${key}`).toBeHidden();
      await expect(page.locator('#diagram-stage > svg')).toBeVisible();
    }
  }
});

test('exports actual raster, PDF, ASCII, source, and graph data files', async ({ page }) => {
  await page.goto('/');
  await rendered(page);
  await replaceSource(page, 'flowchart LR\n A[Export test] --> B[Destination]');
  await rendered(page);
  const formats = ['png', 'jpeg', 'webp', 'pdf', 'ascii', 'source', 'd2', 'json'];
  for (const format of formats) {
    await page.locator('#export-format').selectOption(format);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloading;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    expect(bytes.length).toBeGreaterThan(30);
    if (format === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    if (format === 'jpeg') expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
    if (format === 'webp') expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
    if (format === 'pdf') expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    if (format === 'ascii') expect(bytes.toString()).toContain('Export test');
    if (format === 'source') expect(bytes.toString()).toContain('flowchart LR');
    if (format === 'd2') expect(bytes.toString()).toContain('Export test');
    if (format === 'json') expect(JSON.parse(bytes.toString()).layout).toBe('tala');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#export-format').selectOption('png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
