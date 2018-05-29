"use strict";

const DappReg = artifacts.require("./DappReg.sol");

contract("DappReg", accounts => {
  const assertThrowsAsync = async (fn, msg) => {
    try {
      await fn();
    } catch (err) {
      assert(err.message.includes(msg), "Expected error to include: " + msg);
      return;
    }
    assert.fail("Expected fn to throw");
  };

  const owner = accounts[1];
  const id = "awesome";

  it("should allow registering a new dapp", async () => {
    const dappReg = await DappReg.deployed();

    const watcher = dappReg.Registered();

    // the registration requires a fee of 1 ETH
    await dappReg.register(id, { value: web3.toWei("1", "ether"), from: owner });

    // if successful the contract should emit a `Registered` event
    const events = await watcher.get();

    assert.equal(events.length, 1);
    assert.equal(web3.toUtf8(events[0].args.id), id);
    assert.equal(events[0].args.owner, owner);

    // dapp count should increase
    const dappCount = await dappReg.count();
    assert.equal(dappCount, 1);

    // the dapp should be accessible through the getters
    let dapp = await dappReg.at(0);
    assert.equal(web3.toUtf8(dapp[0]), id);
    assert.equal(dapp[1], owner);

    dapp = await dappReg.get(id);
    assert.equal(web3.toUtf8(dapp[0]), id);
    assert.equal(dapp[1], owner);
  });

  it("should allow the dapp owner to associate metadata with a dapp", async () => {
    const dappReg = await DappReg.deployed();

    const watcher = dappReg.MetaChanged();

    // accounts[0] is not the dapp owner so the request should fail
    await assertThrowsAsync(
      () => dappReg.setMeta(id, "key", "value", { from: accounts[0] }),
      "revert",
    );

    // sending request from dapp owner account should succeed
    await dappReg.setMeta(id, "key", "value", { from: owner });

    // if successful the contract should emit a `MetaChanged` event
    const events = await watcher.get();

    assert.equal(events.length, 1);
    assert.equal(web3.toUtf8(events[0].args.id), id);
    assert.equal(web3.toUtf8(events[0].args.key), "key");
    assert.equal(web3.toUtf8(events[0].args.value), "value");

    // the dapp metadata should be accessible through the getter
    const value = await dappReg.meta(id, "key");
    assert.equal(web3.toUtf8(value), "value");
  });

  it("should allow the dapp owner to transfer ownership of the dapp", async () => {
    const dappReg = await DappReg.deployed();
    const watcher = dappReg.OwnerChanged();

    // only the owner of the dapp can transfer ownership
    await assertThrowsAsync(
      () => dappReg.setDappOwner(id, accounts[0], { from: accounts[2] }),
      "revert",
    );

    // the dapp owner should not change
    let newOwner = (await dappReg.get(id))[1];
    assert.equal(newOwner, owner);

    // we successfully transfer ownership of the contract
    await dappReg.setDappOwner(id, accounts[0], { from: owner });

    // the `owner` should point to the new owner
    newOwner = (await dappReg.get(id))[1];
    assert.equal(newOwner, accounts[0]);

    // it should emit a `OwnerChanged` event
    const events = await watcher.get();

    assert.equal(events.length, 1);
    assert.equal(web3.toUtf8(events[0].args.id), id);
    assert.equal(events[0].args.owner, accounts[0]);

    // the old owner can no longer set a new owner
    await assertThrowsAsync(
      () => dappReg.setOwner(accounts[0], { from: owner }),
      "revert",
    );
  });

  it("should abort registration if the id is already taken", async () => {
    const dappReg = await DappReg.deployed();

    const watcher = dappReg.Registered();

    // id is already taken
    await assertThrowsAsync(
      () => dappReg.register(id, { value: web3.toWei("1", "ether") }),
      "revert",
    );

    // no events are emitted
    const events = await watcher.get();
    assert.equal(events.length, 0);
  });

  it("should abort registration if the fee isn't paid", async () => {
    const dappReg = await DappReg.deployed();

    const watcher = dappReg.Registered();

    // no value is sent with the transaction
    await assertThrowsAsync(
      () => dappReg.register("dapp"),
      "revert",
    );

    // no sufficient value is sent with the transaction
    await assertThrowsAsync(
      () => dappReg.register("dapp", { value: web3.toWei("0.5", "ether") }),
      "revert",
    );

    // no events are emitted
    const events = await watcher.get();
    assert.equal(events.length, 0);
  });

  it("should allow the contract owner or dapp owner to unregister a dapp", async () => {
    const testDappReg = async () => {
      const dappReg = await DappReg.new();
      await dappReg.register(id, { value: web3.toWei("1", "ether"), from: owner });
      return dappReg;
    };

    {
      const dappReg = await testDappReg();
      // accounts[2] is neither the contract owner or dapp owner so request should fail
      await assertThrowsAsync(
        () => dappReg.unregister(id, { from: accounts[2] }),
        "revert",
      );
    }

    const testUnregister = async (from) => {
      const dappReg = await testDappReg();
      const watcher = dappReg.Unregistered();

      await dappReg.unregister(id, { from: from });

      // it should emit a `Unregistered` event
      const events = await watcher.get();

      assert.equal(events.length, 1);
      assert.equal(web3.toUtf8(events[0].args.id), id);
    };

    // contract owner should be able to unregister dapp
    await testUnregister(accounts[0]);
    // dapp owner should be able to unregister dapp
    await testUnregister(owner);
  });

  it("should allow the owner of the contract to transfer ownership of the contract", async () => {
    const dappReg = await DappReg.deployed();
    const watcher = dappReg.NewOwner();

    // only the owner of the contract can transfer ownership
    await assertThrowsAsync(
      () => dappReg.setOwner(accounts[1], { from: accounts[1] }),
      "revert",
    );

    let owner = await dappReg.owner();
    assert.equal(owner, accounts[0]);

    // we successfully transfer ownership of the contract
    await dappReg.setOwner(accounts[1]);

    // the `owner` should point to the new owner
    owner = await dappReg.owner();
    assert.equal(owner, accounts[1]);

    // it should emit a `NewOwner` event
    const events = await watcher.get();

    assert.equal(events.length, 1);
    assert.equal(events[0].args.old, accounts[0]);
    assert.equal(events[0].args.current, accounts[1]);

    // the old owner can no longer set a new owner
    await assertThrowsAsync(
      () => dappReg.setOwner(accounts[0], { from: accounts[0] }),
      "revert",
    );
  });

  it("should allow the contract owner to set the registration fee", async () => {
    const dappReg = await DappReg.deployed();

    // only the contract owner can set a new fee
    await assertThrowsAsync(
      () => dappReg.setFee(10, { from: accounts[0] }),
      "revert",
    );

    await dappReg.setFee(10, { from: accounts[1] });
    const fee = await dappReg.fee();

    assert.equal(fee, 10);
  });

  it("should allow the contract owner to drain all the ether from the contract", async () => {
    const dappReg = await DappReg.deployed();

    // only the contract owner can drain the contract
    await assertThrowsAsync(
      () => dappReg.drain({ from: accounts[0] }),
      "revert",
    );

    const balance = web3.eth.getBalance(accounts[1]);
    await dappReg.drain({ from: accounts[1] });

    const newBalance = web3.eth.getBalance(accounts[1]);
    const expectedBalance = balance.plus(web3.toBigNumber(web3.toWei("0.99", "ether")));

    // accounts[1]'s balance should have increased by at least 0.99 ETH (to account for gas costs)
    assert(newBalance.gte(expectedBalance));
  });

  it("should not allow interactions with unregistered dapps", async () => {
    const dappReg = await DappReg.deployed();

    // unregister the dapp
    await dappReg.unregister(id, { from: owner });

    await assertThrowsAsync(
      () => dappReg.at(0),
      "revert",
    );

    await assertThrowsAsync(
      () => dappReg.get(id),
      "revert",
    );

    await assertThrowsAsync(
      () => dappReg.meta(id, "key"),
      "revert",
    );

    await assertThrowsAsync(
      () => dappReg.unregister(id, { from: owner }),
      "revert",
    );

    await assertThrowsAsync(
      () => dappReg.setMeta(id, "key", "value", { from: owner }),
      "revert",
    );

    await assertThrowsAsync(
      () => dappReg.setDappOwner(id, accounts[0], { from: owner }),
      "revert",
    );
  });
});
