import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-vibespot';

const appModule = await import('../src/app.js');
const userModule = await import('../src/models/User.js');
const spotModule = await import('../src/models/Spot.js');
const listModule = await import('../src/models/CustomList.js');

const app =
  appModule.default ||
  appModule.app ||
  (typeof appModule.createApp === 'function' ? appModule.createApp() : null);

if (!app) {
  throw new Error(
    `Impossible de résoudre l'application Express depuis backend/src/app.js (exports: ${Object.keys(appModule).join(', ')})`,
  );
}

const User = userModule.default || userModule.User;
const Spot = spotModule.default || spotModule.Spot;
const CustomList = listModule.default || listModule.CustomList;

function signToken(userId, email) {
  return jwt.sign({ sub: userId, id: userId, email }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

function mockQuery(result) {
  const query = {
    lean: () => query,
    select: () => query,
    populate: () => query,
    sort: () => query,
    limit: () => query,
    skip: () => query,
    setOptions: () => query,
    session: () => query,
    exec: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    catch: (reject) => Promise.resolve(result).catch(reject),
  };
  return query;
}

describe('Intégration Backend — Révocation ACL et Suppression d’ami', () => {
  let server;
  let baseUrl;

  const ownerId = '6745a1000000000000000001';
  const revokedFriendId = '6745a1000000000000000002';
  const spotId = '6745a2000000000000000010';

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    mock.restoreAll();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('bloque par 403 Forbidden l’accès d’un utilisateur révoqué à un spot PRIVATE', async () => {
    const privateSpotDoc = {
      _id: spotId,
      id: spotId,
      title: 'Crique secrète',
      category: 'nature',
      moods: ['calme'],
      budget: 1,
      location: { type: 'Point', coordinates: [7.26, 43.7] },
      address: 'Cap de Nice',
      city: 'Nice',
      visibility: 'PRIVATE',
      sharedWith: [],
      createdBy: ownerId,
      toJSON() {
        return { ...this };
      },
    };

    const findByIdMock = mock.method(Spot, 'findById', () =>
      mockQuery(privateSpotDoc),
    );
    const userFindMock = mock.method(User, 'findById', (id) =>
      mockQuery({
        _id: id,
        id,
        name: 'Utilisateur Révoqué',
        email: 'revoked@vibespot.fr',
        friends: [],
      }),
    );

    try {
      const token = signToken(revokedFriendId, 'revoked@vibespot.fr');
      const res = await fetch(`${baseUrl}/api/spots/${spotId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 403);
      const body = await res.json();
      assert.ok(body.message);
    } finally {
      findByIdMock.mock.restore();
      userFindMock.mock.restore();
    }
  });

  it('révoque en cascade les spots privés et listes collaboratives lors de DELETE /api/friends/:friendId', async () => {
    const makeMockUser = (id) => ({
      _id: id,
      id,
      name: id === ownerId ? 'Nordine' : 'Sarah',
      friends: [ownerId, revokedFriendId],
      save: async function () {
        return this;
      },
    });

    const userExistsMock = mock.method(User, 'exists', () =>
      mockQuery({ _id: revokedFriendId }),
    );
    const userFindByIdMock = mock.method(User, 'findById', (id) =>
      mockQuery(makeMockUser(id)),
    );
    const userFindOneMock = mock.method(User, 'findOne', () =>
      mockQuery(makeMockUser(revokedFriendId)),
    );
    const userFindByIdAndUpdateMock = mock.method(
      User,
      'findByIdAndUpdate',
      (id) => mockQuery(makeMockUser(id)),
    );
    const userUpdateOneMock = mock.method(User, 'updateOne', () =>
      mockQuery({ acknowledged: true, modifiedCount: 1 }),
    );
    const userUpdateManyMock = mock.method(User, 'updateMany', () =>
      mockQuery({ acknowledged: true, modifiedCount: 2 }),
    );
    const spotUpdateManyMock = mock.method(Spot, 'updateMany', () =>
      mockQuery({ acknowledged: true, modifiedCount: 1 }),
    );
    const listUpdateManyMock = mock.method(CustomList, 'updateMany', () =>
      mockQuery({ acknowledged: true, modifiedCount: 1 }),
    );

    try {
      const token = signToken(ownerId, 'nordine@vibespot.fr');
      const res = await fetch(`${baseUrl}/api/friends/${revokedFriendId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.revokedSpotsCount, 2);
      assert.ok(spotUpdateManyMock.mock.calls.length >= 1);
      assert.ok(listUpdateManyMock.mock.calls.length >= 1);
    } finally {
      userExistsMock.mock.restore();
      userFindByIdMock.mock.restore();
      userFindOneMock.mock.restore();
      userFindByIdAndUpdateMock.mock.restore();
      userUpdateOneMock.mock.restore();
      userUpdateManyMock.mock.restore();
      spotUpdateManyMock.mock.restore();
      listUpdateManyMock.mock.restore();
    }
  });
});