'use client';

import { useState } from 'react';
import { MapPin, Calendar } from 'lucide-react';
import type { VoterInfo } from '@/lib/civic-info';

export function PollingLocationFinder() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [voterInfo, setVoterInfo] = useState<VoterInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/civic/voter-info?address=${encodeURIComponent(address)}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch voter information');
      }

      const data = await response.json();
      setVoterInfo(data);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full p-md bg-gradient-violet rounded-xl">
      <h2 className="text-subhead text-ink font-bold mb-md flex items-center gap-2">
        <MapPin className="text-ink" />
        Find Your Polling Location
      </h2>

      <form onSubmit={handleSearch} className="mb-md">
        <div className="flex gap-2">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter your address (e.g., 123 Main St, Mumbai)"
            className="flex-1 px-[14px] py-[10px] bg-surface-1 border border-hairline rounded-md text-body focus:outline-none focus:ring-1 focus:ring-accent-blue"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="px-[15px] py-[10px] bg-primary text-on-primary hover:opacity-90 rounded-pill text-button disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-sm bg-surface-1 border border-gradient-orange rounded-lg mb-sm">
          <p className="text-gradient-orange text-body">{error}</p>
          <p className="text-micro text-ink-muted mt-1">
            Note: Google Civic API primarily covers US elections. 
            For Indian elections, visit <a href="https://eci.gov.in" className="underline" target="_blank">ECI.gov.in</a>
          </p>
        </div>
      )}

      {voterInfo && (
        <div className="space-y-sm">
          {/* Election Info */}
          <div className="p-sm bg-surface-1 rounded-lg">
            <h3 className="text-body font-bold mb-2 flex items-center gap-2 text-ink">
              <Calendar className="text-ink" size={20} />
              {voterInfo.election.name}
            </h3>
            <p className="text-body-sm text-ink-muted">
              Election Day: {new Date(voterInfo.election.electionDay).toLocaleDateString()}
            </p>
          </div>

          {/* Polling Locations */}
          {voterInfo.pollingLocations && voterInfo.pollingLocations.length > 0 && (
            <div className="p-sm bg-surface-1 rounded-lg">
              <h3 className="text-body font-bold mb-sm text-ink">Your Polling Locations:</h3>
              {voterInfo.pollingLocations.map((location, idx) => (
                <div key={idx} className="mb-sm last:mb-0 pb-sm last:pb-0 border-b border-hairline last:border-b-0">
                  <p className="text-body font-medium text-ink">{location.name}</p>
                  <p className="text-body-sm text-ink-muted">{location.address}</p>
                  {location.pollingHours && (
                    <p className="text-micro text-ink-muted mt-1">
                      Hours: {location.pollingHours}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Contests/Candidates */}
          {voterInfo.contests && voterInfo.contests.length > 0 && (
            <div className="p-sm bg-surface-1 rounded-lg">
              <h3 className="text-body font-bold mb-sm text-ink">On Your Ballot:</h3>
              {voterInfo.contests.slice(0, 3).map((contest, idx) => (
                <div key={idx} className="mb-sm last:mb-0">
                  <p className="text-body font-medium text-accent-blue">{contest.office}</p>
                  <div className="mt-2 space-y-1">
                    {contest.candidates?.map((candidate, cidx) => (
                      <div key={cidx} className="text-body-sm flex justify-between items-center text-ink">
                        <span>{candidate.name}</span>
                        <span className="text-ink-muted">{candidate.party}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
