import React from 'react';
import StudentIssues from '../components/StudentIssues';
import { useAuth } from '../hooks/useAuth';

const IssuesPage: React.FC = () => {
  const { user } = useAuth();
  const studentId = user?.studentId;

  return (
    <div className="global-bg">
      <div className="flex w-full items-center justify-center">
        <div className="grow max-w-6xl h-[80vh] overflow-y-auto bg-white rounded-2xl shadow-lg mt-28 mx-8 custom-scrollbar">
          <div className="relative">
            <div className="sticky top-0 bg-white z-10 py-4 px-5">
              <h2 className="text-2xl font-bold">Account Verification Issues</h2>
            </div>
            <StudentIssues studentId={studentId} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default IssuesPage;
