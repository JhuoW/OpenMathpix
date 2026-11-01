// Playwright's waitForFunction may treat an async predicate's Promise as truthy.
// Evaluate and await the condition in Node so IPC-based checks actually poll.
async function waitForApp(page, predicate, arg, timeout = 30000) {
  if (!Number.isFinite(timeout) || timeout <= 0)
    throw new Error('waitForApp requires a positive timeout in milliseconds.');

  const condition = predicate.toString().replace(/\s+/g, ' ').slice(0, 240);
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`Timed out after ${timeout}ms waiting for app condition: ${condition}`)),
      timeout,
    );
  });

  try {
    while (true) {
      const result = await Promise.race([page.evaluate(predicate, arg), deadline]);
      if (result) return result;
      await Promise.race([new Promise((resolve) => setTimeout(resolve, 50)), deadline]);
    }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { waitForApp };
