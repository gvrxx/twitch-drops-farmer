import fs from 'node:fs';

const MAX_BYTES = 1024 * 1024;

// The dashboard's Activity lines, kept in a plain text file that you can also
// open yourself. When it passes 1 MB it moves to activity.old.log and starts over.
export class ActivityLog {
  constructor(file) {
    this.file = file;
  }

  append({ t, level, msg }) {
    try {
      if ((fs.statSync(this.file, { throwIfNoEntry: false })?.size ?? 0) > MAX_BYTES) {
        fs.renameSync(this.file, this.file.replace(/\.log$/, '.old.log'));
      }
      fs.appendFileSync(this.file, `${new Date(t).toISOString()} ${level} ${String(msg).replace(/\s*\n\s*/g, ' ')}\n`);
    } catch {
      // Logging must never stop farming.
    }
  }

  // The last `count` lines, in the same shape the dashboard uses.
  recent(count) {
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return [];
    }
    return text
      .split('\n')
      .slice(-count - 1)
      .map((line) => line.match(/^(\S+) (\w+) (.*)$/))
      .filter((m) => m && !Number.isNaN(Date.parse(m[1])))
      .map((m) => ({ t: Date.parse(m[1]), level: m[2], msg: m[3] }))
      .slice(-count);
  }
}
