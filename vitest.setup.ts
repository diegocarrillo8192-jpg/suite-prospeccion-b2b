import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  const dialogProto = window.HTMLDialogElement?.prototype;
  if (dialogProto) {
    dialogProto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    dialogProto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
  }
}
