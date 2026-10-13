import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import ElectionDetail from '../components/elections/ElectionDetail';
import ElectionList from '../components/elections/ElectionList';
import { Skeleton } from '../components/elections/ui';
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
      toast.error(getApiErrorMessage(error, 'Could not load elections'));
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
    <div className="global-bg min-h-screen pt-36">
      <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
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
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-32" />
            <Skeleton className="h-64" />
          </div>
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
