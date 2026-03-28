import { Track, TrackProfile, RaceState, VehicleState, Driver, TeamSpecs } from '../../types';

export interface IPhysicsSystem {
  updateVehiclePhysics(
    vehicle: VehicleState,
    driver: Driver,
    state: RaceState,
    track: Track,
    trackProfile: TrackProfile,
    dt: number,
    teamSpecs?: TeamSpecs
  ): void;
}
