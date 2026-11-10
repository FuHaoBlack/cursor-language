/** Only these fields are shown to the user. Anything else is left alone. */
const UI_FIELDS = [
  'label', 'description', 'placeholder', 'accessibleLabel', 'ariaLabel', 'tooltip',
  'subtitle', 'buttonLabel', 'emptyLabel', 'emptyText', 'heading',
  'confirmText', 'title', 'children'
];

const FIELD_RE = new RegExp(
  `\\b(${UI_FIELDS.join('|')})\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`,
  'g'
);


function unescapeJs(raw) {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|["\\/bfnrt])/g, (_, token) => {
    if (token.startsWith('u')) return String.fromCharCode(Number.parseInt(token.slice(1), 16));
    return { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[token] ?? token;
  });
}

function escapeJs(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function translateLiteral(raw, dict, hits) {
  const english = unescapeJs(raw);
  if (!Object.prototype.hasOwnProperty.call(dict, english)) return null;
  const translated = dict[english];
  if (typeof translated !== 'string' || translated === english) return null;
  hits.set(english, (hits.get(english) || 0) + 1);
  return escapeJs(translated);
}

/**
 * Cursor Settings sidebar titles, keyed by the internal id.
 * Only this exact English value is replaced. The same id is reused for icons,
 * colors and abbreviation tables (`mcp:"MCP"`), and those must stay as they are.
 */
const SIDEBAR_ENGLISH = {
  general: 'General',
  profile: 'Profile',
  'vscode-settings': 'VS Code Settings',
  appearance: 'Appearance',
  fun: 'Fun',
  'plan-usage': 'Plan & Usage',
  chat: 'Agents',
  browser: 'Browser & Network',
  tab: 'Tab',
  models: 'Models',
  'git-prs': 'Git & PRs',
  rules: 'Rules, Skills, Subagents',
  plugins: 'Plugins',
  customize: 'Customize',
  indexing: 'Indexing',
  mcp: 'Tools & MCPs',
  hooks: 'Hooks',
  beta: 'Beta',
  network: 'Network',
  'background-composer': 'Cloud Agents',
  'grok-bot': 'Grok Bot',
  'self-driving': 'Self-Driving PRs',
  worktrees: 'Worktrees',
  developer: 'Developer'
};

/** Composer mode names, one object, same text in the desktop and glass bundles. */
const MODE_FROM = 'agent:"Agent",chat:"Chat",background:"Cloud",plan:"Plan",spec:"Spec",debug:"Debug",triage:"Triage"';
const MODE_PARTS = [
  ['agent', 'Agent'],
  ['chat', 'Chat'],
  ['background', 'Cloud'],
  ['plan', 'Plan'],
  ['spec', 'Spec'],
  ['debug', 'Debug'],
  ['triage', 'Triage']
];

/** Quoted literals that are shown as-is, not as a `label:` / `title:` field. */
const BARE_LABELS = [
  'Rules, Skills, Subagents',
  'Code Intelligence',
  'Indexing',
  'Privacy Mode',
  'Privacy Mode (Legacy)',
  'Switch to Agents Window',
  'Try it now',
  'Run many agents in parallel \u2014 across repos, locally, on remote SSH, and in the cloud.',
  'System Tray Icon',
  'Show Cursor in system tray',
  'Menu Bar Icon',
  'Show Cursor in menu bar',
  'Get Cursor for iOS',
  'Get Grok Bot',
  'Contact Us',
  'Log Out',
  'Share Data',
  'Improve Cursor for everyone',
  'No training. Code may be stored for Background Agent and other features.',
  'Choose the default behavior of messages sent while Agent is working',
  'Custom words that submit a voice prompt. Spaces and punctuation are ignored.',
  'Third-Party Imports',
  'Choose how Agents run tools like command execution, MCP, and file writes.',
  "A classifier will run for each action and decide whether it's safe to execute this command. Allowlists are still respected.",
  'File-Deletion Protection',
  'External-File Protection',
  'Allowlist Options',
  'You can configure Shell, MCP and Fetch allowlists for Auto mode. However, Auto works well without these.',
  'You can configure Shell, MCP, Fetch, and Read allowlists for Auto mode. However, Auto works well without these.',
  'Choose Origin (cursor.com/codebase) or GitHub for GitHub pull request links on web and desktop',
  'Choose Origin (cursor.com/codebase), GitHub, or Graphite for pull request links on web and desktop',
  'Inside Cursor',
  'Index Repositories for Instant Grep',
  'Automatically index repositories to speed up Grep searches. All data is stored locally.',
  'Start from scratch',
  'Use Existing...',
  'This PC',
  'This Mac',
  'This Computer',
  'Submit with Ctrl + Enter',
  'Learn more',
  'When enabled, your cursor.com profile page is visible to anyone with the link.',
  'Public profiles are disabled by your team admin.',
  'Current Plan',
  'Upgrade Available',
  'Adjust Plan',
  'Unlock 3x more usage on Agent & more',
  'Cursor Models',
  'Includes Cursor Grok and Composer',
  'Other Models',
  'Additional usage beyond limits consumes Other Models quota or on-demand spend.',
  'Additional usage beyond limits consumes on-demand spend.',
  'Search Settings',
  'Remote Control',
  'Allow agents on this computer to be controlled remotely from mobile',
  'Auto-Review',
  'Auto-Review (with Sandbox)',
  'Auto-review',
  'Auto-review (with Sandbox)',
  'Allowlist',
  'Run Everything',
  'Run Everything (Unsandboxed)',
  'Auto-Accept Web Search',
  'Skip approval dialog; Agent may run web searches automatically',
  'Wait indefinitely to authenticate when prompted. When off, skip authentication prompts after 30 seconds.',
  'Browser Automation',
  'Browser Protection',
  'Connected to Browser Tab',
  'Browser Tab',
  'Browser automation disabled',
  'Prevent Agent from automatically running Browser tools',
  'Open Local Links in Cursor Browser',
  'Open Web Links in Cursor Browser',
  'Automatically open localhost links in the Browser Tab',
  'Automatically open http and https links in the Browser Tab',
  'By default, get notifications for stable updates. In Early Access, pre-release builds may be unstable for production work.',
  'Plan, Build, / for skills, @ for context',
  'Plan New Idea',
  'Multitask',
  'Run in Cloud',
  'Run locally in a Worktree',
  'Start with a plan',
  'Align on implementation before writing code',
  'Debug an issue',
  'Find root causes and fix tricky bugs',
  'New Automation',
  'No Automations Yet',
  'Ship better code, faster',
  'Review Code with Bugbot',
  'Catch bugs and auto-fix before they ship.',
  'Scan and Triage Security Vulnerabilities',
  'Security checks on every change.',
  'Route PR Reviews and Auto-Approve',
  'Assign reviewers and approve PRs.',
  'Get Started',
  'All Runs',
  'Mine',
  'Team',
  'Search...',
  'New Project',
  'Projects',
  'Automate repetitive tasks with always-on agents and configure Cursor\'s built-in agents for your team.',
  'Show status filters',
  'Show PR filters',
  'Show environment filters',
  'Sidebar filters',
  'Hide Sidebar',
  'Show Sidebar'
];

/** Fragments inside template literals. The translation is the dictionary value. */
const PHRASES = [
  'Prevent Agent from creating or modifying files outside of the workspace automatically',
  'Prevent Agent from deleting files automatically',
  'Use with caution. Skip symlinks during .cursorignore file discovery. Enable only when all .cursorignore files are reachable without symlinks.',
  'Apply .cursorignore files to all subdirectories',
  'Changing this setting requires restarting Cursor.',
  ' (controlled by admin)',
  'Accept the next word of a suggestion via ',
  'Automatically import necessary modules for ',
  'Automatically parse links when pasted into Quick Edit (',
  "Mark Agent commits as 'Made with Cursor'",
  'Mark pull requests as made with Cursor',
  'Automatically index repositories to speed up Grep searches. All data is stored locally.',
  'Usage limits reset on ',
  '${s} hour${s===1?"":"s"} and ${o} minute${o===1?"":"s"} left',
  '${s} hour${s===1?"":"s"} left',
  '${o} minute${o===1?"":"s"} left',
  '${a} day${a===1?"":"s"} left',
  '${dh1(t)}% used',
  'Included in ',
  'Enter submits chat, Enter inserts a newline, and primary actions move to ',
  'Submit with ',
  'return"Customize"',
  'name:"Customize"',
  'value:"New Chat"',
  '||"New Chat"',
  '??"New Chat"',
  'LABEL="New Chat"',
  'pageTitle:"Automations"',
  'e7a="New Chat"',
  'MUd="New Chat"',
  '{value:"source",label:"Source",icon:"arrow-bracket-to-right"}'
];

/**
 * Agents sidebar “Source” means 来源. The same word on a file tab means the
 * raw view, so it cannot be a plain `label:"Source"` replacement.
 * The minified binding between these two fields changes between builds.
 */
const SOURCE_FILTER_KEY = 'contentLabel:"Show source filters",label:"Source"';
const SOURCE_FILTER_RE = /contentLabel:"Show source filters",deviates:([A-Za-z_$][\w$]*),label:"Source"/g;

const NAV_RE = /(?:"([A-Za-z0-9-]+)"|([A-Za-z_$][\w$]*)):"((?:\\.|[^"\\])*)"/g;

/**
 * Replace a translation only when the English text is the entire value of a
 * UI field (`label:"…"`, `title:"…"`, …) or a Cursor Settings sidebar name.
 * A word inside a longer string, a search keyword, or an id is left alone.
 */
const EXTRA_DISPLAY_COPY = [
  "Sign-in on this device is restricted by your organization's device policy. Sign in with an allowed account to continue.",
  "Slack isn't available for this Project",
  'Your browser is signed in to another Cursor account. Switch to this one, then connect again.',
  "Slack didn't finish connecting. Connect again to pick up where you left off.",
  'Finish in Slack, then connect again. If Slack asked for approval, an admin must approve Cursor first.',
  'Approve Cursor in Slack. This updates on its own.',
  'Ask a Slack admin to approve Cursor, then connect again'
];

export function rewrite(source, dict) {
  FIELD_RE.lastIndex = 0;
  const hits = new Map();
  let count = 0;
  const replaceDisplayLiterals = (block) => block.replace(/"((?:\\.|[^"\\])*)"/g, (full, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `"${translated}"`;
  });
  let text = source;
  // Edit-session descriptors contain additional display fields beside placeholder.
  // Match the complete descriptor, leaving queue-item/goal dispatch IDs intact.
  text = text.replace(/\b(?:queueItem|goal):\(\)=>\(\{bannerLabel:"(?:\\.|[^"\\])*",placeholder:"(?:\\.|[^"\\])*",cancelLabel:"(?:\\.|[^"\\])*",pillLabel:"(?:\\.|[^"\\])*",pillTitle:"(?:\\.|[^"\\])*"\}\)/g,
    replaceDisplayLiterals);
  text = text.replace(/\brecordScreenToolCall:\{loading:"Recording screen",completed:"Recorded screen",error:"Record screen"\}/g,
    replaceDisplayLiterals);
  // These contiguous constants belong to the computer permission component.
  // The permission IDs and ordinary Allow/Ready strings elsewhere are untouched.
  text = text.replace(/[A-Za-z_$][\w$]*="Enable Computer Use",[A-Za-z_$][\w$]*="Allow Cursor to use your computer\.",[A-Za-z_$][\w$]*="Cursor Computer Use is not available in this build",[A-Za-z_$][\w$]*="Back to Cursor",[A-Za-z_$][\w$]*="Computer Use is ready",[A-Za-z_$][\w$]*="Allow",[A-Za-z_$][\w$]*="Allowing(?:\\u2026|…)",[A-Za-z_$][\w$]*="Ready"(?=,[A-Za-z_$][\w$]*=\[\{kind:"accessibility")/g,
    replaceDisplayLiterals);
  text = text.replace(FIELD_RE, (full, field, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `${field}:"${translated}"`;
  });

  // The credits card's parent title is a variable, rather than a literal UI
  // field. Require both its paired commerce locale and the nearby component
  // context so unrelated "Credits" strings and the English locale stay intact.
  text = text.replace(/(?<![\w$])(?:(var|let|const)\s+)?([A-Za-z_$][\w$]*)="Credits",([A-Za-z_$][\w$]*)="en"(?=[;},])/g,
    (full, declaration, title, locale, offset) => {
      const context = text.slice(Math.max(0, offset - 5000), offset + full.length + 5000);
      if (!context.includes('import("./workbench.xai-commerce-prepaid.js")') ||
          !context.includes('"plan-usage-credits-card"') ||
          !new RegExp(`\\btitle\\s*:\\s*${title.replace(/[$]/g, '\\$&')}(?![\\w$])`).test(context) ||
          !new RegExp(`\\blocale\\s*:\\s*${locale.replace(/[$]/g, '\\$&')}(?![\\w$])`).test(context)) return full;
      const translated = translateLiteral('Credits', dict, hits);
      if (translated === null) return full;
      count++;
      return `${declaration ? declaration + ' ' : ''}${title}="${translated}",${locale}="en"`;
    });

  // These full sentences are notification/view-model copy rather than IDs.
  for (const english of EXTRA_DISPLAY_COPY) {
    const from = `"${escapeJs(english)}"`;
    if (!text.includes(from)) continue;
    const translated = translateLiteral(english, dict, hits);
    if (translated === null) continue;
    const occurrences = text.split(from).length - 1;
    count += occurrences;
    hits.set(english, (hits.get(english) || 0) + occurrences - 1);
    text = text.split(from).join(`"${translated}"`);
  }

  text = text.replace(/"aria-label"\s*:\s*"((?:\\.|[^"\\])*)"/g, (full, raw) => {
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    return `"aria-label":"${translated}"`;
  });

  NAV_RE.lastIndex = 0;
  text = text.replace(NAV_RE, (full, quotedKey, bareKey, raw) => {
    const key = quotedKey || bareKey;
    if (SIDEBAR_ENGLISH[key] !== unescapeJs(raw)) return full;
    const translated = translateLiteral(raw, dict, hits);
    if (translated === null) return full;
    count++;
    const prop = quotedKey ? `"${quotedKey}"` : bareKey;
    return `${prop}:"${translated}"`;
  });

  if (text.includes(MODE_FROM)) {
    let partCount = 0;
    const modeTo = MODE_PARTS.map(([key, english]) => {
      const translated = translateLiteral(english, dict, hits);
      if (translated === null) return `${key}:"${english}"`;
      partCount++;
      return `${key}:"${translated}"`;
    }).join(',');
    const modeHits = text.split(MODE_FROM).length - 1;
    if (modeHits && partCount) {
      count += modeHits * partCount;
      text = text.split(MODE_FROM).join(modeTo);
    }
  }

  let bareCount = 0;
  for (const english of BARE_LABELS) {
    if (!Object.prototype.hasOwnProperty.call(dict, english)) continue;
    const translated = escapeJs(dict[english]);
    if (translated === english) continue;
    const forms = new Set([`"${english}"`]);
    if (/[^\x00-\x7f]/.test(english)) {
      const hex = english.replace(/[^\x00-\x7f]/g, (ch) => {
        const code = ch.charCodeAt(0).toString(16).padStart(4, '0');
        return `\\u${code}`;
      });
      forms.add(`"${hex}"`);
      forms.add(`"${hex.toUpperCase()}"`);
    }
    for (const from of forms) {
      if (!text.includes(from)) continue;
      const n = text.split(from).length - 1;
      bareCount += n;
      hits.set(english, (hits.get(english) || 0) + n);
      text = text.split(from).join(`"${translated}"`);
    }
  }
  count += bareCount;

  for (const english of PHRASES) {
    if (!Object.prototype.hasOwnProperty.call(dict, english)) continue;
    const translated = dict[english];
    if (typeof translated !== 'string' || translated === english || !text.includes(english)) continue;
    const n = text.split(english).length - 1;
    count += n;
    hits.set(english, (hits.get(english) || 0) + n);
    text = text.split(english).join(translated);
  }

  const sourceFilter = dict[SOURCE_FILTER_KEY];
  if (typeof sourceFilter === 'string' && sourceFilter !== SOURCE_FILTER_KEY && sourceFilter.includes('",label:"')) {
    SOURCE_FILTER_RE.lastIndex = 0;
    text = text.replace(SOURCE_FILTER_RE, (full, binding) => {
      count++;
      hits.set(SOURCE_FILTER_KEY, (hits.get(SOURCE_FILTER_KEY) || 0) + 1);
      return sourceFilter.replace('",label:"', `",deviates:${binding},label:"`);
    });
  }

  return { text, count, hits };
}
