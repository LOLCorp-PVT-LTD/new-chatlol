/**
 * Test database: TEST_MONGODB_URL if set (CI, Docker), else an embedded single-node replica set
 * (mongodb-memory-server) so transactions behave like production. Each test file gets its own database.
 */
export async function useTestMongo(name) {
  process.env.MONGODB_DB = `chatlol_test_${name}_${process.pid}`;
  if (process.env.TEST_MONGODB_URL) {
    process.env.MONGODB_URL = process.env.TEST_MONGODB_URL;
    return { stop: async () => {} };
  }
  const { MongoMemoryReplSet } = await import('mongodb-memory-server-core');
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URL = rs.getUri();
  return { stop: () => rs.stop() };
}
