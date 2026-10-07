/** useQuery recarga al invalidar su ámbito y no hace setState tras unmount. */
import React, { useState } from "react";
import { Text } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { notifyDataChanged } from "../../refresh/dataRevision";
import { useQuery } from "../useWorkTracker";

function Switcher() {
  const [id, setId] = useState(1);
  const q = useQuery(async () => `s${id}`, [id, id * 10], ["ledger"]);
  return (
    <Text
      onPress={() => setId(2)}
      testID="switch"
    >
      {q.data ?? "empty"}
    </Text>
  );
}

describe("useQuery + dataRevision", () => {
  test("un aviso del ámbito recarga; otro ámbito no", async () => {
    let reads = 0;
    function Counter() {
      const q = useQuery(async () => {
        reads += 1;
        return `n${reads}`;
      }, ["same"], ["trace"]);
      return <Text>{q.data ?? "empty"}</Text>;
    }
    render(<Counter />);
    await waitFor(() => expect(screen.getByText(/^n\d+$/)).toBeTruthy());
    const before = reads;
    await act(async () => {
      notifyDataChanged(["sessions"], { immediate: true });
    });
    expect(reads).toBe(before);
    await act(async () => {
      notifyDataChanged(["trace"], { immediate: true });
    });
    await waitFor(() => expect(reads).toBe(before + 1));
  });

  test("al desmontar ignora la respuesta tardía", async () => {
    let resolve: (value: string) => void = () => undefined;
    function Late() {
      const q = useQuery(() => new Promise<string>((r) => { resolve = r; }), ["x"], ["ledger"]);
      return <Text>{q.data ?? "pending"}</Text>;
    }
    const view = render(<Late />);
    view.unmount();
    await act(async () => {
      resolve("tarde");
      await Promise.resolve();
    });
  });

  test("cambiar el id de recurso sustituye el dato anterior", async () => {
    render(<Switcher />);
    await waitFor(() => expect(screen.getByText("s1")).toBeTruthy());
    fireEvent.press(screen.getByTestId("switch"));
    await waitFor(() => expect(screen.getByText("s2")).toBeTruthy());
  });
});
