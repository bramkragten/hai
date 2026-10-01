import { expect } from "@open-wc/testing";
import { formatBytes, listBlockDevices } from "../../../src/api/commands.js";
import { MOCK_BLOCK_DEVICES } from "../../../src/api/mock-data.js";

describe("api/commands", () => {
  describe("listBlockDevices", () => {
    // Some platforms also enumerate internal disks; they must never be
    // offered, nor accepted when the selection is re-checked.
    it("leaves out non-removable disks", async () => {
      MOCK_BLOCK_DEVICES.push({
        ...MOCK_BLOCK_DEVICES[0],
        id: "internal-disk",
        removable: false,
      });
      try {
        const ids = (await listBlockDevices()).map((device) => device.id);
        expect(ids).to.not.include("internal-disk");
        expect(ids).to.include(MOCK_BLOCK_DEVICES[0].id);
      } finally {
        MOCK_BLOCK_DEVICES.pop();
      }
    });
  });

  describe("formatBytes", () => {
    it("formats 0 bytes", () => {
      expect(formatBytes(0)).to.equal("0 B");
    });

    it("formats bytes", () => {
      expect(formatBytes(500)).to.equal("500 B");
    });

    it("formats kilobytes", () => {
      expect(formatBytes(1024)).to.equal("1 KB");
      expect(formatBytes(1536)).to.equal("1.5 KB");
    });

    it("formats megabytes", () => {
      expect(formatBytes(1048576)).to.equal("1 MB");
      expect(formatBytes(1572864)).to.equal("1.5 MB");
    });

    it("formats gigabytes", () => {
      expect(formatBytes(1073741824)).to.equal("1 GB");
      expect(formatBytes(34359738368)).to.equal("32 GB");
    });

    it("formats terabytes", () => {
      expect(formatBytes(1099511627776)).to.equal("1 TB");
    });
  });
});
