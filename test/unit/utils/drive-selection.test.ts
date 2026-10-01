import { expect } from "@open-wc/testing";
import type { BlockDevice } from "../../../src/api/types.js";
import { wizardState } from "../../../src/state/wizard-state.js";
import {
  driveIdentity,
  isSameDrive,
  readDriveSelection,
  storeDriveSelection,
} from "../../../src/utils/drive-selection.js";

const makeDrive = (overrides: Partial<BlockDevice> = {}): BlockDevice => ({
  id: "/dev/sda",
  name: "USB Drive",
  size: 32 * 1000 * 1000 * 1000,
  device_type: "usb_drive",
  removable: true,
  model: "Ultra Fit",
  vendor: "SanDisk",
  ...overrides,
});

describe("drive-selection", () => {
  afterEach(() => wizardState.reset());

  describe("isSameDrive", () => {
    it("rejects another device that took over the same path", () => {
      expect(
        isSameDrive(
          driveIdentity(makeDrive()),
          driveIdentity(makeDrive({ model: "Cruzer Blade" }))
        )
      ).to.be.false;
    });

    it("ignores the display name, which can change with mount state", () => {
      expect(
        isSameDrive(
          driveIdentity(makeDrive()),
          driveIdentity(makeDrive({ name: "SANDISK (E:)" }))
        )
      ).to.be.true;
    });

    it("never matches an unknown size", () => {
      const unknown = { ...driveIdentity(makeDrive()), size: undefined };
      expect(isSameDrive(unknown, driveIdentity(makeDrive()))).to.be.false;
    });
  });

  it("stores the full identity, not just the path", () => {
    const drive = makeDrive();
    storeDriveSelection(drive);

    expect(readDriveSelection(wizardState.getState().selections)).to.deep.equal(
      driveIdentity(drive)
    );
  });
});
