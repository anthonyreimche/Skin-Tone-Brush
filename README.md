# Skin Tone Brush

A Safelight extension that smooths skin where you paint it. Blotchy tone and uneven colour even out, while pores, fine hair and the skin's own texture stay as they were, so the result doesn't look plastic.

It works by frequency separation. Inside the painted area the image is split into two layers: a low-frequency layer that holds tone and colour, and a high-frequency layer that holds the texture. The low layer is evened out and the texture is laid back over it.

## Using it

1. Open the **Skin Tone Brush** panel in Develop and click **Paint** (or press **Shift+K**).
2. Paint over the skin you want to smooth. The painted area is tinted red while **Show mask** is on.
3. Adjust the sliders. They act only where you painted.
4. Click **Done** (or press **Esc**) to put the brush away.

### The sliders

- **Smoothing**: how strongly blotches of tone and colour are evened out.
- **Smoothing size**: how large an area is averaged. Raise it for broad, uneven patches; lower it for small blotches.
- **Texture**: how much of the fine texture is kept. 100 keeps it as it was, lower values soften it, and values above 100 bring out more of it.
- **Texture size**: what counts as texture. Detail smaller than this is kept as texture; anything larger is part of the tone that Smoothing evens out. Raise it on close-up portraits, lower it when faces are small in the frame.

Smoothing holds back next to strong edges, such as brows, lash lines and the rims of lips, so their tone doesn't bleed into the skin beside them.

### The brush

While the brush is on, the panel shows **Size**, **Feather**, **Opacity** and **Flow**, an **Erase** switch and **Show mask**. Develop's brush shortcuts work as they do for masks: **[** and **]** change the size, **Shift+[** and **Shift+]** the feather, **,** and **.** the opacity, **Shift+,** and **Shift+.** the flow. Hold **Alt** to erase, and **Shift+click** to paint a straight line from the last point. Hold **Space** or **Ctrl** to pan and zoom while the brush is on. **Clear** removes everything painted on the photo.

## Things to know

- The painted area and the slider values are saved with each photo's edit, so they come back when you reopen it, undo and redo step through them, and they export. Presets leave them out, because the painted area belongs to one photo. Copy and paste settings carries them with the other extension settings.
- The radii are a share of the photo, not of the screen, so the result is the same at any zoom and in an export of any size.
- The tool runs before exposure, white balance and the tone tools, on the image as the decode tools and Heal leave it. Highlights above white and colours outside sRGB are kept.
- A photo with nothing painted costs nothing to render.
- Heal blemishes first: the brush evens tone and colour, but it doesn't remove spots.

## Licence

GPL-3.0-or-later. See `LICENSE`.
