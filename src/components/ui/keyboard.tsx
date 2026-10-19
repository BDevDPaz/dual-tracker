import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform, findNodeHandle, type KeyboardEvent, type ScrollView, type TextInput } from "react-native";
import { TOKENS } from "../../constants/theme";

/** Cuánto tapa el teclado la ventana que React ve. Si Android ya encogió la ventana, el solape es 0. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  const baseline = useRef(Dimensions.get("window").height);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (event: KeyboardEvent) => {
      const windowH = Dimensions.get("window").height;
      const shrunk = Math.max(0, baseline.current - windowH);
      setInset(Math.max(0, event.endCoordinates.height - shrunk));
    };
    const onHide = () => {
      baseline.current = Dimensions.get("window").height;
      setInset(0);
    };
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return inset;
}

type KeyboardScrollApi = {
  scrollToNode: (node: TextInput | null) => void;
};

export const KeyboardScrollContext = createContext<KeyboardScrollApi | null>(null);

export function useKeyboardScroll(): KeyboardScrollApi | null {
  return useContext(KeyboardScrollContext);
}

/** Lleva el campo enfocado por encima del teclado. No-op si el nodo de prueba no mide layout. */
export function scrollFieldIntoView(scroll: ScrollView | null, node: TextInput | null): void {
  if (!scroll || !node || typeof node.measureLayout !== "function") return;
  const handle = findNodeHandle(scroll);
  if (handle == null) return;
  node.measureLayout(
    handle,
    (_x: number, y: number) => {
      scroll.scrollTo({ y: Math.max(0, y - TOKENS.spacing.xl), animated: true });
    },
    () => undefined,
  );
}

export function KeyboardScrollProvider({
  scrollRef,
  children,
}: {
  scrollRef: React.RefObject<ScrollView | null>;
  children: React.ReactNode;
}) {
  const api = useRef<KeyboardScrollApi>({
    scrollToNode: (node) => scrollFieldIntoView(scrollRef.current, node),
  });
  return <KeyboardScrollContext.Provider value={api.current}>{children}</KeyboardScrollContext.Provider>;
}
