// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ERC20FixedSupply is ERC20, Ownable {
    string private _tokenURI;
    bool public launched;

    constructor(string memory name, string memory symbol, uint256 initialSupply, string memory tokenURI_)
        ERC20(name, symbol)
        Ownable(msg.sender)
    {
        _mint(msg.sender, initialSupply * 10 ** decimals());
        _tokenURI = tokenURI_;
    }

    function tokenURI() public view virtual returns (string memory) {
        return _tokenURI;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (!launched) {
            require(from == owner() || to == owner(), "Forbidden action");
        }

        super._update(from, to, value);
    }

    function launch() external onlyOwner {
        launched = true;
    }
}
