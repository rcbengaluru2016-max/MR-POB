"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/status-badge";
import { searchCustomers } from "@/lib/mr/mock-service";
import type { Customer } from "@/lib/mr/types";

export function MrCustomerSearch({ onSelect }: { onSelect: (customer: Customer) => void }) {
  const [query, setQuery] = useState("");
  const customers = searchCustomers(query);
  return <section className="company-panel" aria-labelledby="mr-customer-search">
    <div className="company-panel-heading"><div><h2 id="mr-customer-search">Select a customer</h2><p>Search existing records. Only approved customers can place orders.</p></div><Search size={18} className="text-muted" aria-hidden="true" /></div>
    <Field label="Customer Search"><TextInput type="search" placeholder="Name, customer code, phone or PIN code" value={query} onChange={(event) => setQuery(event.target.value)} /></Field>
    <p className="mt-3 text-xs text-muted" role="status">{customers.length} matching {customers.length === 1 ? "customer" : "customers"}</p>
    <div className="mr-customerGrid">{customers.map((customer) => <article key={customer.id} className="mr-customerCard">
      <div className="mr-cardHeading"><div><h3>{customer.name}</h3><p>{customer.code}</p></div><StatusBadge value={customer.status} /></div>
      <dl><div><dt>Phone number</dt><dd>{customer.phone}</dd></div><div><dt>PIN code</dt><dd>{customer.pinCode}</dd></div></dl>
      <Button type="button" variant="secondary" disabled={customer.status !== "approved"} aria-label={`Select ${customer.name}`} onClick={() => onSelect(customer)}>{customer.status === "approved" ? "Select customer" : customer.status === "rejected" ? "Registration rejected" : "Approval pending"}</Button>
    </article>)}</div>
    {!customers.length && <div className="mr-empty"><Search size={24} aria-hidden="true" /><p>No customers match your search.</p><Button variant="ghost" type="button" onClick={() => setQuery("")}>Clear search</Button></div>}
  </section>;
}

export function MrCustomerDetails({ customer }: { customer: Customer }) {
  return <dl className="mr-customerDetails"><div><dt>Customer name</dt><dd>{customer.name}</dd></div><div><dt>Customer code</dt><dd>{customer.code}</dd></div><div><dt>Phone number</dt><dd>{customer.phone}</dd></div><div><dt>PIN code</dt><dd>{customer.pinCode}</dd></div></dl>;
}
