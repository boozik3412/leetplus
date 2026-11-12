import assert from "node:assert/strict";
import test from "node:test";
import { groupIntoColumns, moveToColumn, type BoardColumn } from "./board.ts";

type Status = "OPEN" | "IN_PROGRESS" | "DONE";
type Task = { id: string; status: Status | "CANCELED" };

const columns: BoardColumn<Status>[] = [
  { key: "OPEN", label: "Новые" },
  { key: "IN_PROGRESS", label: "В работе" },
  { key: "DONE", label: "Готово" },
];
const tasks: Task[] = [
  { id: "a", status: "OPEN" },
  { id: "b", status: "DONE" },
  { id: "c", status: "OPEN" },
  { id: "d", status: "CANCELED" },
];

test("groups items by column, keeps order, leaves out unknown columns", () => {
  const groups = groupIntoColumns(
    tasks,
    columns,
    (task) => task.status as Status,
  );

  assert.deepEqual([...groups.keys()], ["OPEN", "IN_PROGRESS", "DONE"]);
  assert.deepEqual(
    groups.get("OPEN")?.map((task) => task.id),
    ["a", "c"],
  );
  assert.deepEqual(groups.get("IN_PROGRESS"), []);
  assert.deepEqual(
    groups.get("DONE")?.map((task) => task.id),
    ["b"],
  );
});

test("moves one item and keeps its place in the list", () => {
  const next = moveToColumn(
    tasks,
    "c",
    "IN_PROGRESS",
    (task) => task.id,
    (task) => task.status as Status,
    (task, status) => ({ ...task, status }),
  );

  assert.deepEqual(
    next.map((task) => `${task.id}:${task.status}`),
    ["a:OPEN", "b:DONE", "c:IN_PROGRESS", "d:CANCELED"],
  );
  assert.equal(tasks[2].status, "OPEN", "the original list is not changed");
});

test("returns the same list when nothing moves", () => {
  const idOf = (task: Task) => task.id;
  const columnOf = (task: Task) => task.status as Status;
  const withColumn = (task: Task, status: Status) => ({ ...task, status });

  assert.equal(
    moveToColumn(tasks, "a", "OPEN", idOf, columnOf, withColumn),
    tasks,
  );
  assert.equal(
    moveToColumn(tasks, "zzz", "DONE", idOf, columnOf, withColumn),
    tasks,
  );
});
