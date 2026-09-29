const fs = require('node:fs/promises');
const path = require('node:path');

// Tests point DUKA_STORE_PATH at a throwaway file, so a test run can never
// read or overwrite the data the developer is actually working against.
const STORE_PATH = process.env.DUKA_STORE_PATH || path.join(__dirname, 'data', 'store.json');

function seed() {
  return {
    users: [
      { id: 'u-demo', name: 'Demo Student', email: 'demo@stu.cu.edu.ng', createdAt: new Date().toISOString() }
    ],
    listings: [
      {
        id: 'l-demo', sellerId: 'u-demo', title: 'Mini Fridge (Hostel-Friendly, 45L)',
        category: 'hostel', price: 65000, condition: 'Good',
        description: 'Quiet mini fridge suitable for a shared hostel room.', delivery: 'self',
        status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      }
    ],
    carts: {}, orders: [], conversations: [], sessions: {}
  };
}

// All file access runs through a single promise chain so concurrent requests
// never write the same .tmp file at once (Windows rename races caused EPERM).
let queue = Promise.resolve();

function enqueue(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

function internalRead() {
  return fs.readFile(STORE_PATH, 'utf8')
    .then(raw => { const data = JSON.parse(raw); if (!data.sessions) data.sessions = {}; return data; })
    .catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
}

async function write(data) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  const temporary = `${STORE_PATH}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data, null, 2));
  await fs.rename(temporary, STORE_PATH);
}

async function read() {
  return enqueue(async () => {
    const data = await internalRead();
    if (data) return data;
    const seeded = seed();
    await write(seeded);
    return seeded;
  });
}

async function update(mutator) {
  return enqueue(async () => {
    let data = await internalRead();
    if (!data) { data = seed(); await write(data); }
    const result = await mutator(data);
    await write(data);
    return result;
  });
}

module.exports = { read, update };