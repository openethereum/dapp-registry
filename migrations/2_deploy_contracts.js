"use strict";

const DappReg = artifacts.require("./DappReg.sol");

module.exports = deployer => {
  deployer.deploy(DappReg);
};
