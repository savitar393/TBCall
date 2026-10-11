import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/login-form';
import { IdentityDashboard } from '@/components/identity-dashboard';
import { fixtureUser } from './fixtures';
const { session } = vi.hoisted(()=>({session:{status:'anonymous',user:null as unknown,isPending:false,error:null,login:vi.fn(),refresh:vi.fn()}}));
vi.mock('@/lib/auth/session',()=>({useSession:()=>session}));
beforeEach(()=>{session.status='anonymous';session.user=null;});
it('offers public account creation and recovery from login',()=>{
 render(<LoginForm/>);
 expect(screen.getByRole('link',{name:'Buat akun'})).toHaveAttribute('href','/register');
 expect(screen.getByRole('link',{name:'Lupa kata sandi?'})).toHaveAttribute('href','/forgot-password');
});
it('explains verified but unlinked access without offering a patient claim',()=>{
 session.status='authenticated';session.user={...fixtureUser,roles:[],permissions:[],activeFacilities:[]};
 render(<IdentityDashboard/>);
 expect(screen.getByText(/Hubungi fasilitas kesehatan untuk menghubungkan catatan pengobatan Anda/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Periksa akses terbaru'})).toBeInTheDocument();
 expect(screen.queryByRole('link',{name:/klaim|cari pasien/i})).not.toBeInTheDocument();
});
