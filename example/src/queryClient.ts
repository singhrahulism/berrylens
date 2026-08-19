import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

export interface Person {
  id: number;
  name: string;
}

export async function fetchNearbyPeople(): Promise<Person[]> {
  const response = await fetch("https://jsonplaceholder.typicode.com/users");
  const users = (await response.json()) as Array<{ id: number; name: string }>;
  return users.slice(0, 5).map((user) => ({ id: user.id, name: user.name }));
}
