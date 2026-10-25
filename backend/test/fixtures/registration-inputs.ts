import { CompanyRegistrationDto, CustomerRegistrationDto, PatientRegistrationDto } from '../../src/registrations/registration.dto';

const common = { password: 'Registration123', confirmPassword: 'Registration123', termsAccepted: true };
export const customerInput = (overrides: Partial<CustomerRegistrationDto> = {}): CustomerRegistrationDto => ({
  ...common, customerName: 'Ananya Rao', mobile: '9876543210', email: 'owner@example.test',
  businessName: 'Example Pharmacy', customerType: 'Retail Pharmacy', addressLine1: '12 Example Road',
  pinCode: '560001', dlNumber1: 'DL-100', dlNumber2: 'DL-200', gstNumber: 'GST-EXAMPLE',
  creditDays: 'same_day_3', paymentMethod: 'UPI', ...overrides,
});
export const companyInput = (overrides: Partial<CompanyRegistrationDto> = {}): CompanyRegistrationDto => ({
  ...common, companyName: 'Example Pharma', division: 'South', headquarter: 'Bengaluru',
  adminFullName: 'Company Admin', adminEmail: 'admin@example.test', adminMobile: '9876543211', ...overrides,
});
export const patientInput = (overrides: Partial<PatientRegistrationDto> = {}): PatientRegistrationDto => ({
  ...common, patientName: 'Patient Example', mobile: '9876543212', email: 'patient@example.test',
  gender: 'Female', address: '18 Example Street Bengaluru', paymentMethod: 'Cash on Delivery', ...overrides,
});
