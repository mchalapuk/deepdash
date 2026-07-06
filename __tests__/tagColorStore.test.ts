import {
  __resetTagColorStoreForTests,
  __tagColorPaletteSizeForTests,
  tagColorActions,
} from "@/app/_stores/tagColorStore";

describe("tagColorActions.ensureColor", () => {
  beforeEach(() => {
    __resetTagColorStoreForTests();
  });

  it("hands out every palette color once before any repeat, then repeats the same round-robin pattern", () => {
    const paletteSize = __tagColorPaletteSizeForTests();
    const tags = Array.from({ length: paletteSize * 3 }, (_, i) => `tag-${i}`);
    for (const tag of tags) tagColorActions.ensureColor(tag);

    const colors = tagColorActions.exportData().colors;
    const rounds = Array.from({ length: 3 }, (_, r) =>
      tags.slice(r * paletteSize, (r + 1) * paletteSize).map((t) => colors[t]),
    );

    for (const round of rounds) {
      expect(new Set(round).size).toBe(paletteSize);
    }
  });

  it("is a no-op once a tag already has a color", () => {
    tagColorActions.ensureColor("stable");
    const first = tagColorActions.exportData().colors.stable;

    for (let i = 0; i < 10; i++) tagColorActions.ensureColor("stable");

    expect(tagColorActions.exportData().colors.stable).toBe(first);
  });

  it("normalizes tag text so casing/whitespace share one color", () => {
    tagColorActions.ensureColor("Errand");
    tagColorActions.ensureColor("  errand  ");

    const colors = tagColorActions.exportData().colors;
    expect(Object.keys(colors)).toEqual(["errand"]);
  });

  it("never assigns the same color twice in a row, even across round boundaries", () => {
    const paletteSize = __tagColorPaletteSizeForTests();
    const tags = Array.from({ length: paletteSize * 4 }, (_, i) => `tag-${i}`);
    for (const tag of tags) tagColorActions.ensureColor(tag);

    const colors = tagColorActions.exportData().colors;
    const sequence = tags.map((t) => colors[t]);

    for (let i = 1; i < sequence.length; i++) {
      expect(sequence[i]).not.toBe(sequence[i - 1]);
    }
  });
});
