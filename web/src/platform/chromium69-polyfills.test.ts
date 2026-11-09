import { describe, expect, it } from "vitest";
import { installReplaceChildren } from "./chromium69-polyfills";

type Child = object | string;
type FakeElement = { children: Child[]; append(...nodes: Child[]): void; replaceChildren(...nodes: Child[]): void };

/** Just enough of an Element (text content and children), with the polyfill on a fresh prototype. */
function polyfilledElement(...children: Child[]): FakeElement {
  const proto = {
    set textContent(value: string) {
      (this as unknown as FakeElement).children = value ? [value] : [];
    },
    append(this: FakeElement, ...nodes: Child[]) {
      this.children.push(...nodes);
    },
  };
  installReplaceChildren(proto as Parameters<typeof installReplaceChildren>[0]);
  return Object.assign(Object.create(proto) as FakeElement, { children });
}

describe("installReplaceChildren", () => {
  it("replaces the children with the given nodes", () => {
    const el = polyfilledElement({}, "old");
    const kept = {};

    el.replaceChildren(kept, "text");

    expect(el.children).toEqual([kept, "text"]);
    expect(el.children[0]).toBe(kept);
  });

  it("empties the element when called without nodes", () => {
    const el = polyfilledElement("old");

    el.replaceChildren();

    expect(el.children).toEqual([]);
  });

  it("keeps a native implementation", () => {
    const native = () => {};
    const proto = { replaceChildren: native };

    installReplaceChildren(proto);

    expect(proto.replaceChildren).toBe(native);
  });
});
