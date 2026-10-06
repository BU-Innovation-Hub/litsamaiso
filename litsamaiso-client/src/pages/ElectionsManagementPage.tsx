import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import ElectionDetail from '../components/elections/ElectionDetail';
import ElectionList from '../components/elections/ElectionList';
import { electionService } from '../services/electionService';
import type { Election } from '../types';
import { getApiErrorMessage } from '../utils/apiError';

const ElectionsManagementPage: React.FC = () => {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  // The open election lives in the URL so a refresh keeps SAAD on the same election
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedElectionId = searchParams.get('election') || '';

  const loadElections = useCallback(async () => {
    try {
      setElections(await electionService.getElections());
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Failed to load elections'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadElections();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadElections]);

  const openElection = (electionId: string) => setSearchParams(electionId ? { election: electionId } : {});

  const selectedElection = elections.find((election) => election._id === selectedElectionId);

  return (
    <div className="mt-5 min-h-screen bg-gray-50 pt-24">
      <div className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Elections Management</h1>
          <p className="text-gray-600">Create, schedule, and run institution elections.</p>
        </div>

        {selectedElection ? (
          <ElectionDetail
            key={selectedElection._id}
            election={selectedElection}
            onBack={() => openElection('')}
            onElectionChanged={loadElections}
            onDeleted={() => {
              openElection('');
              void loadElections();
            }}
          />
        ) : selectedElectionId && loading ? (
          <p className="text-center text-gray-500">Loading...</p>
        ) : (
          <ElectionList
            elections={elections}
            loading={loading}
            onOpen={openElection}
            onCreated={(election) => {
              void loadElections().then(() => openElection(election._id));
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ElectionsManagementPage;
