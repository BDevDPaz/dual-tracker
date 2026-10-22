/** useBusyAction — busy, anti-doble toque y aviso si el fallo no se publicó. */
import React from "react";
import { Pressable, Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { FeedbackService } from "../../../services/application/FeedbackService";
import { Store } from "../../store";
import { BUSY_HOLD_MS, useBusyAction } from "../useBusyAction";

function Harness({ action, surface }: { action: () => Promise<unknown>; surface?: boolean }) {
  const { busy, run } = useBusyAction();
  return (
    <>
      <Text testID="busy">{busy ? "yes" : "no"}</Text>
      <Pressable accessibilityRole="button" testID="go" onPress={() => void run(action, surface === undefined ? undefined : { surface })}>
        <Text>go</Text>
      </Pressable>
    </>
  );
}

describe("useBusyAction", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("ocupa durante la acción, ignora el segundo toque y vuelve a aceptar tras la espera", async () => {
    jest.useFakeTimers();
    let release: (value: { ok: true }) => void = () => undefined;
    let calls = 0;
    const action = () => {
      calls += 1;
      return new Promise<{ ok: true }>((resolve) => {
        release = resolve;
      });
    };
    render(<Harness action={action} />);
    expect(screen.getByTestId("busy").props.children).toBe("no");

    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    expect(calls).toBe(1);
    expect(screen.getByTestId("busy").props.children).toBe("yes");

    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    expect(calls).toBe(1);

    await act(async () => {
      release({ ok: true });
    });
    expect(screen.getByTestId("busy").props.children).toBe("no");
    expect(Store.getState().feedback.pending).toHaveLength(0);

    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    expect(calls).toBe(1);

    await act(async () => {
      jest.advanceTimersByTime(BUSY_HOLD_MS);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    expect(calls).toBe(2);
  });

  test("un throw suelta busy y publica un error genérico", async () => {
    render(
      <Harness
        action={async () => {
          throw new Error("falló");
        }}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    expect(screen.getByTestId("busy").props.children).toBe("no");
    expect(Store.getState().feedback.pending.at(-1)?.code).toBe("GENERIC_ERROR");
  });

  test("un {ok:false} silencioso se avisa; uno que ya publicó aviso no se duplica", async () => {
    const silent = render(<Harness action={async () => ({ ok: false as const, code: "NOPE" })} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    const rejected = Store.getState().feedback.pending.at(-1);
    expect(rejected?.code).toBe("INTENT_REJECTED");
    expect(rejected?.params.reason).toBe("NOPE");
    silent.unmount();

    Store.reset();
    render(
      <Harness
        action={async () => {
          FeedbackService.emit("GENERIC_ERROR");
          return { ok: false as const, code: "NOPE" };
        }}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    const pending = Store.getState().feedback.pending;
    expect(pending.filter((item) => item.code === "GENERIC_ERROR")).toHaveLength(1);
    expect(pending.filter((item) => item.code === "INTENT_REJECTED")).toHaveLength(0);
  });

  test("surface:false no publica el rechazo (la pantalla ya lo explica)", async () => {
    render(<Harness surface={false} action={async () => ({ ok: false as const, code: "NOTE_REQUIRED" })} />);
    await act(async () => {
      fireEvent.press(screen.getByTestId("go"));
    });
    expect(Store.getState().feedback.pending).toHaveLength(0);
    expect(screen.getByTestId("busy").props.children).toBe("no");
  });
});
