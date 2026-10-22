"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { mockOrders, mockProfile } from "@/lib/mr/mock-data";
import { emptyDraft, getMrOrders } from "@/lib/mr/mock-service";
import type { MrProfile, Order, OrderDraft } from "@/lib/mr/types";

type Workspace = {
  profile: MrProfile;
  orders: Order[];
  draft: OrderDraft;
  setDraft: Dispatch<SetStateAction<OrderDraft>>;
  addOrder: (order: Order) => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);

export function MrWorkspaceProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState(() => getMrOrders(mockOrders, mockProfile.id));
  const [draft, setDraft] = useState<OrderDraft>(emptyDraft);
  return <WorkspaceContext value={{ profile: mockProfile, orders, draft, setDraft, addOrder: (order) => setOrders((current) => [order, ...current]) }}>{children}</WorkspaceContext>;
}

export function useMrWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("MR components require MrWorkspaceProvider.");
  return context;
}
