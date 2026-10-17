"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { FileInput } from "@/components/forms/file-input";
import { TermsDialog } from "@/components/forms/terms-dialog";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { companyRegistrationSchema } from "@/lib/validation";
import type { z } from "zod";
type Values = z.infer<typeof companyRegistrationSchema>;
export function CompanyRegistrationForm({ adminMode = false, onCreated }: { adminMode?: boolean; onCreated?: () => void }) {
  const router = useRouter(); const [serverError,setServerError]=useState(""); const [successMessage,setSuccessMessage]=useState(""); const [termsOpen,setTermsOpen]=useState(false);
  const form=useForm<Values>({resolver:zodResolver(companyRegistrationSchema),defaultValues:{companyName:"",division:"",headquarter:"",adminFullName:"",adminEmail:"",adminMobile:"",password:"",confirmPassword:"",termsAccepted:false}});
  const termsAccepted = useWatch({ control: form.control, name: "termsAccepted" });
  async function onSubmit(values:Values){setServerError("");setSuccessMessage("");const fd=new FormData();Object.entries(values).forEach(([k,v])=>{if(v instanceof FileList){if(v[0])fd.append(k,v[0])}else if(typeof v==="boolean")fd.append(k,String(v));else if(v)fd.append(k,String(v))});try{if(adminMode)fd.set("kind","company");const res=await fetch(adminMode?"/api/super-admin/registrations/single":"/api/register/company",{method:"POST",body:fd});const data=await res.json();if(!res.ok){setServerError(data.error??"Registration failed");return}if(adminMode){form.reset();setSuccessMessage("Company registration saved as Pending Verification.");onCreated?.()}else router.push("/register/success?type=company")}catch{setServerError("Unable to submit registration. Check your connection and try again.")}}
  return <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}><div className="grid gap-4 md:grid-cols-2">
    <Field label="Company Name *" error={form.formState.errors.companyName?.message}><TextInput {...form.register("companyName")}/></Field>
    <Field label="Division *" error={form.formState.errors.division?.message}><TextInput {...form.register("division")}/></Field>
    <Field label="Headquarter *" error={form.formState.errors.headquarter?.message}><TextInput {...form.register("headquarter")}/></Field>
    <Field label="Admin Full Name *" error={form.formState.errors.adminFullName?.message}><TextInput {...form.register("adminFullName")}/></Field>
    <Field label="Admin Email Address *" error={form.formState.errors.adminEmail?.message}><TextInput type="email" {...form.register("adminEmail")}/></Field>
    <Field label="Admin Mobile Number *" error={form.formState.errors.adminMobile?.message}><TextInput inputMode="numeric" {...form.register("adminMobile")}/></Field>
    <Field label="Password *" error={form.formState.errors.password?.message}><TextInput type="password" {...form.register("password")}/></Field>
    <Field label="Confirm Password *" error={form.formState.errors.confirmPassword?.message}><TextInput type="password" {...form.register("confirmPassword")}/></Field>
    <FileInput label="Company Logo *" accept="image/jpeg,image/png,image/webp" error={form.formState.errors.companyLogo?.message} registration={form.register("companyLogo")}/>
    <FileInput label="Admin Photo *" accept="image/jpeg,image/png,image/webp" error={form.formState.errors.adminPhoto?.message} registration={form.register("adminPhoto")}/>
  </div>
  <div>
    <a href="#company-terms" onClick={e=>{e.preventDefault();setTermsOpen(true)}} className="text-sm font-semibold text-brand underline underline-offset-2 hover:text-brand-dark">Terms &amp; Conditions *</a>
  </div>
  <TermsDialog open={termsOpen} title="Terms & Conditions" checked={termsAccepted} onCheckedChange={v=>form.setValue("termsAccepted",v,{shouldDirty:true,shouldValidate:true})} onClose={()=>setTermsOpen(false)}><ol id="company-terms" className="list-decimal space-y-3 pl-5 text-sm leading-6 text-foreground"><li>The company administrator is authorised to manage this company account.</li><li>Company and customer information must be kept confidential and used only for legitimate business operations.</li><li>Account credentials must not be shared and must be protected from unauthorised access.</li></ol></TermsDialog>
  {form.formState.errors.termsAccepted ? <p className="text-sm text-danger">{form.formState.errors.termsAccepted.message}</p> : null}
  {serverError ? <p className="text-sm text-danger" role="alert">{serverError}</p> : null}
  {successMessage ? <p className="text-sm text-green-700" role="status">{successMessage}</p> : null}
  <Button disabled={form.formState.isSubmitting}>
    {form.formState.isSubmitting ? "Submitting..." : "Submit"}
  </Button>
  </form>;
}
