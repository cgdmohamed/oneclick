import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Companies from './Companies';
import Users360 from './Users360';

const CompaniesAndUsers = () => {
  const [tab, setTab] = useState<'companies' | 'users'>('companies');
  return (
    <Tabs dir="rtl" value={tab} onValueChange={(v) => setTab(v as 'companies' | 'users')}>
      <TabsList className="mb-4">
        <TabsTrigger value="companies">الشركات</TabsTrigger>
        <TabsTrigger value="users">المشتركون</TabsTrigger>
      </TabsList>
      <TabsContent value="companies"><Companies /></TabsContent>
      <TabsContent value="users"><Users360 /></TabsContent>
    </Tabs>
  );
};

export default CompaniesAndUsers;
