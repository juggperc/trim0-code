import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { Icns, IcnsImage } from "@fiahfy/icns";

const root = process.cwd();
const buildDir = path.join(root, "build");
const sourcePath = path.join(buildDir, "icon-source.svg");
const pngPath = path.join(buildDir, "icon.png");
const icoPath = path.join(buildDir, "icon.ico");
const icnsPath = path.join(buildDir, "icon.icns");

await fs.mkdir(buildDir, { recursive: true });

const svgBuffer = await fs.readFile(sourcePath);
const pngBuffer = await sharp(svgBuffer).resize(512, 512).png().toBuffer();
await fs.writeFile(pngPath, pngBuffer);

const icoBuffer = await pngToIco([pngBuffer]);
await fs.writeFile(icoPath, icoBuffer);

const icns = new Icns();
const iconTypes = [
  [16, "icp4"],
  [32, "icp5"],
  [64, "icp6"],
  [128, "ic07"],
  [256, "ic08"],
  [512, "ic09"],
];

for (const [size, osType] of iconTypes) {
  const buffer = await sharp(svgBuffer).resize(size, size).png().toBuffer();
  icns.append(IcnsImage.fromPNG(buffer, osType));
}
await fs.writeFile(icnsPath, icns.data);
