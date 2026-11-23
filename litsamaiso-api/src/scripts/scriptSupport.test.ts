import assert from "node:assert/strict";
import test from "node:test";
import { assertHostAllowed, databaseOf, hasFlag, hostOf, isLocalHost, readFlag } from "./scriptSupport.js";

test("a database on this machine is allowed without confirmation", () => {
  assert.equal(assertHostAllowed("mongodb://127.0.0.1:27017/litsamaiso_db", undefined, "erase data"), "127.0.0.1:27017");
  assert.equal(assertHostAllowed("mongodb://localhost/litsamaiso_db", undefined, "erase data"), "localhost");
});

test("a database elsewhere needs --confirm-host with its exact host", () => {
  const atlas = "mongodb+srv://user:secret@cluster0.abc.mongodb.net/prod?retryWrites=true";
  assert.throws(() => assertHostAllowed(atlas, undefined, "erase data"), /--confirm-host=cluster0\.abc\.mongodb\.net/);
  assert.throws(() => assertHostAllowed(atlas, "cluster0", "erase data"), /isn't this machine/);
  assert.equal(assertHostAllowed(atlas, "cluster0.abc.mongodb.net", "erase data"), "cluster0.abc.mongodb.net");
});

test("hosts and database names are read from the connection string, never the credentials", () => {
  assert.equal(hostOf("mongodb://admin:p%40ss@db.internal:27017/app"), "db.internal:27017");
  assert.equal(databaseOf("mongodb://127.0.0.1:27017/litsamaiso_db"), "litsamaiso_db");
  assert.equal(databaseOf("mongodb://127.0.0.1:27017/"), "test");
  assert.equal(isLocalHost("127.0.0.1.evil.com"), false);
  assert.throws(() => hostOf("postgres://localhost/db"), /isn't a MongoDB connection string/);
});

test("flags are read as --name=value or --name value", () => {
  const argv = ["node", "script", "--institution", "Botho University Lesotho", "--confirm-host=db:1", "--commit"];
  assert.equal(readFlag("institution", argv), "Botho University Lesotho");
  assert.equal(readFlag("confirm-host", argv), "db:1");
  assert.equal(readFlag("commit", argv), undefined);
  assert.equal(hasFlag("commit", argv), true);
  assert.equal(hasFlag("remove", argv), false);
});
