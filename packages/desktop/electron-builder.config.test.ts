import { expect, test } from "bun:test"
import type { Configuration } from "electron-builder"

const legacyDesktopEntry = "resources/linux/bettercode-desktop.desktop"

const channels = [
  { channel: "dev", appId: "ai.bettercode.desktop.dev" },
  { channel: "beta", appId: "ai.bettercode.desktop.beta" },
  { channel: "prod", appId: "ai.bettercode.desktop" },
] as const

for (const channel of channels) {
  test(`uses one Linux desktop identity for ${channel.channel}`, async () => {
    const previous = process.env.BETTERCODE_CHANNEL
    process.env.BETTERCODE_CHANNEL = channel.channel

    const module = await import(`./electron-builder.config.ts?channel=${channel.channel}`)
    const config = module.default as Configuration

    if (previous === undefined) delete process.env.BETTERCODE_CHANNEL
    else process.env.BETTERCODE_CHANNEL = previous

    expect(config.appId).toBe(channel.appId)
    expect(config.extraMetadata?.desktopName).toBe(`${channel.appId}.desktop`)
    expect(config.linux?.executableName).toBe(channel.appId)
    expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(channel.appId)
  })
}

test("keeps a hidden prod launcher for old Linux pins", async () => {
  const previous = process.env.BETTERCODE_CHANNEL
  process.env.BETTERCODE_CHANNEL = "prod"

  const module = await import("./electron-builder.config.ts?compat=prod")
  const config = module.default as Configuration

  if (previous === undefined) delete process.env.BETTERCODE_CHANNEL
  else process.env.BETTERCODE_CHANNEL = previous

  expect(config.deb?.fpm?.[0]).toEndWith(`${legacyDesktopEntry}=/usr/share/applications/bettercode-desktop.desktop`)
  expect(config.rpm?.fpm?.[0]).toEndWith(`${legacyDesktopEntry}=/usr/share/applications/bettercode-desktop.desktop`)

  const desktop = await Bun.file(legacyDesktopEntry).text()
  expect(desktop).toContain("Exec=/opt/BetterCode/ai.bettercode.desktop %U")
  expect(desktop).toContain("Icon=ai.bettercode.desktop")
  expect(desktop).toContain("StartupWMClass=ai.bettercode.desktop")
  expect(desktop).toContain("NoDisplay=true")
})
