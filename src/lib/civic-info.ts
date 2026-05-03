const CIVIC_API_KEY = process.env.GOOGLE_CIVIC_API_KEY;
const CIVIC_BASE_URL = 'https://www.googleapis.com/civicinfo/v2';

export interface PollingLocation {
  name: string;
  address: string;
  pollingHours?: string;
  latitude?: number;
  longitude?: number;
}

export interface ElectionInfo {
  id: string;
  name: string;
  electionDay: string;
  ocdDivisionId: string;
}

export interface VoterInfo {
  election: ElectionInfo;
  pollingLocations?: PollingLocation[];
  contests?: Contest[];
  state?: StateInfo[];
}

export interface Contest {
  type: string;
  office: string;
  candidates: Candidate[];
}

export interface Candidate {
  name: string;
  party: string;
  candidateUrl?: string;
  channels?: { type: string; id: string }[];
}

export interface StateInfo {
  name: string;
  electionAdministrationBody: {
    name: string;
    electionInfoUrl: string;
    electionRegistrationUrl: string;
    electionRegistrationConfirmationUrl: string;
    absenteeVotingInfoUrl: string;
    votingLocationFinderUrl: string;
    ballotInfoUrl: string;
    correspondenceAddress: {
      line1: string;
      city: string;
      state: string;
      zip: string;
    };
  };
}

/**
 * Get voter information by address
 */
export async function getVoterInfo(address: string): Promise<VoterInfo | null> {
  if (!CIVIC_API_KEY) {
    console.warn('GOOGLE_CIVIC_API_KEY not set');
    return null;
  }

  try {
    const params = new URLSearchParams({
      address,
      key: CIVIC_API_KEY
    });

    const response = await fetch(`${CIVIC_BASE_URL}/voterinfo?${params}`);
    
    if (!response.ok) {
      throw new Error(`Civic API error: ${response.status}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('Failed to fetch voter info:', error);
    return null;
  }
}

/**
 * Get list of upcoming elections
 */
export async function getElections(): Promise<ElectionInfo[]> {
  if (!CIVIC_API_KEY) {
    console.warn('GOOGLE_CIVIC_API_KEY not set');
    return [];
  }

  try {
    const response = await fetch(
      `${CIVIC_BASE_URL}/elections?key=${CIVIC_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Civic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.elections || [];

  } catch (error) {
    console.error('Failed to fetch elections:', error);
    return [];
  }
}

/**
 * Get representatives by address
 */
export async function getRepresentatives(address: string) {
  if (!CIVIC_API_KEY) return null;

  try {
    const params = new URLSearchParams({
      address,
      key: CIVIC_API_KEY
    });

    const response = await fetch(
      `${CIVIC_BASE_URL}/representatives?${params}`
    );

    if (!response.ok) {
      throw new Error(`Civic API error: ${response.status}`);
    }

    return await response.json();

  } catch (error) {
    console.error('Failed to fetch representatives:', error);
    return null;
  }
}
