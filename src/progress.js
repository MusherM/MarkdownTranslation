const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  dim: '\x1b[2m'
};

function formatBar({ done, total, width }) {
  const ratio = total > 0 ? Math.min(done / total, 1) : 1;
  const filled = Math.round(ratio * width);
  const empty = Math.max(width - filled, 0);
  const bar = `${ANSI.green}${'━'.repeat(filled)}${ANSI.reset}${ANSI.dim}${'━'.repeat(empty)}${ANSI.reset}`;
  const percent = `${Math.round(ratio * 100)}%`.padStart(4);
  const counts = total > 0 ? ` ${done}/${total}` : '';
  return `${bar} ${percent}${counts}`;
}

export function createProgressBar({ label, stream = process.stdout, width = 24 }) {
  let total = 0;
  let done = 0;
  let started = false;
  let finished = false;
  let lastLen = 0;
  const isTTY = Boolean(stream.isTTY);

  const render = () => {
    if (!isTTY) {
      return;
    }
    const bar = formatBar({ done, total, width });
    const line = `${label} ${bar}`;
    const padded = line.padEnd(lastLen, ' ');
    stream.write(`\r${padded}`);
    lastLen = padded.length;
  };

  const start = (totalCount) => {
    if (started) {
      return;
    }
    total = Number.isFinite(totalCount) ? totalCount : 0;
    done = 0;
    started = true;
    if (!isTTY) {
      console.log(`Translating ${label}...`);
      return;
    }
    render();
  };

  const update = (doneCount) => {
    if (!started) {
      start(total);
    }
    done = Number.isFinite(doneCount) ? doneCount : done;
    render();
  };

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    if (isTTY) {
      render();
      stream.write('\n');
    } else {
      console.log(`Finished ${label}.`);
    }
  };

  return {
    start,
    update,
    finish,
    get started() {
      return started;
    }
  };
}
