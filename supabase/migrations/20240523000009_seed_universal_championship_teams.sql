DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000000'::uuid;
  cnt INTEGER;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.tcc_teams WHERE championship_id = cid;
  IF cnt = 0 THEN
    -- Insert 10 F1 teams for Universal Championship (2024 lineup)
    INSERT INTO public.tcc_teams (championship_id, name, color, budget, reputation, token_cost, performance, specs)
    VALUES
      (cid, 'McLaren', '#F58020', 135000000, 90, 165, '{"car":96,"industry":88,"drivers":92}'::jsonb,
        '{"acceleration":93,"braking":91,"drag_reduction":91,"cornering_low":88,"cornering_mid":94,"cornering_high":95,"ers_efficiency":92,"cooling":90,"lifespan":92,"drs_efficiency":92}'::jsonb),
      (cid, 'Red Bull Racing', '#3671C6', 145000000, 100, 175, '{"car":92,"industry":95,"drivers":95}'::jsonb,
        '{"acceleration":95,"braking":93,"drag_reduction":92,"cornering_low":92,"cornering_mid":96,"cornering_high":96,"ers_efficiency":95,"cooling":92,"lifespan":95,"drs_efficiency":94}'::jsonb),
      (cid, 'Ferrari', '#F91536', 140000000, 95, 175, '{"car":92,"industry":90,"drivers":91}'::jsonb,
        '{"acceleration":92,"braking":94,"drag_reduction":90,"cornering_low":95,"cornering_mid":92,"cornering_high":93,"ers_efficiency":92,"cooling":90,"lifespan":93,"drs_efficiency":90}'::jsonb),
      (cid, 'Mercedes', '#6CD3BF', 140000000, 95, 170, '{"car":91,"industry":92,"drivers":90}'::jsonb,
        '{"acceleration":90,"braking":95,"drag_reduction":90,"cornering_low":92,"cornering_mid":92,"cornering_high":92,"ers_efficiency":93,"cooling":91,"lifespan":94,"drs_efficiency":89}'::jsonb),
      (cid, 'Aston Martin', '#225941', 130000000, 85, 145, '{"car":88,"industry":85,"drivers":88}'::jsonb,
        '{"acceleration":88,"braking":90,"drag_reduction":86,"cornering_low":92,"cornering_mid":90,"cornering_high":88,"ers_efficiency":88,"cooling":89,"lifespan":90,"drs_efficiency":86}'::jsonb),
      (cid, 'Alpine', '#0090FF', 125000000, 80, 125, '{"car":85,"industry":82,"drivers":86}'::jsonb,
        '{"acceleration":84,"braking":85,"drag_reduction":82,"cornering_low":84,"cornering_mid":85,"cornering_high":83,"ers_efficiency":84,"cooling":85,"lifespan":88,"drs_efficiency":82}'::jsonb),
      (cid, 'Williams', '#005AFF', 120000000, 75, 105, '{"car":82,"industry":78,"drivers":80}'::jsonb,
        '{"acceleration":82,"braking":78,"drag_reduction":88,"cornering_low":72,"cornering_mid":75,"cornering_high":76,"ers_efficiency":82,"cooling":86,"lifespan":88,"drs_efficiency":88}'::jsonb),
      (cid, 'RB', '#6692FF', 115000000, 70, 85, '{"car":80,"industry":75,"drivers":82}'::jsonb,
        '{"acceleration":80,"braking":82,"drag_reduction":80,"cornering_low":82,"cornering_mid":84,"cornering_high":82,"ers_efficiency":82,"cooling":84,"lifespan":86,"drs_efficiency":80}'::jsonb),
      (cid, 'Sauber', '#52E252', 110000000, 65, 55, '{"car":74,"industry":64,"drivers":84}'::jsonb,
        '{"acceleration":78,"braking":80,"drag_reduction":78,"cornering_low":80,"cornering_mid":82,"cornering_high":80,"ers_efficiency":80,"cooling":82,"lifespan":85,"drs_efficiency":78}'::jsonb),
      (cid, 'Haas', '#B6BABD', 105000000, 60, 60, '{"car":78,"industry":68,"drivers":82}'::jsonb,
        '{"acceleration":76,"braking":78,"drag_reduction":76,"cornering_low":78,"cornering_mid":78,"cornering_high":76,"ers_efficiency":78,"cooling":80,"lifespan":84,"drs_efficiency":76}'::jsonb);

    -- Facilities defaults
    INSERT INTO public.tcc_facilities (team_id, levels, upgrade_queue)
    SELECT id, '{"factory":1,"aero":1,"powertrain":1,"simulator":1,"pit_crew":1,"logistics":1}'::jsonb, '[]'::jsonb
    FROM public.tcc_teams WHERE championship_id = cid;

    -- Drivers (2024 lineup)
    INSERT INTO public.tcc_drivers (team_id, name, skills, morale, adaptation_by_track)
    VALUES
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='McLaren'), 'Lando Norris', '{"pace":95,"consistency":92,"tire_management":90,"ers_efficiency":88,"racecraft":90,"wet_skill":92}'::jsonb, 95, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='McLaren'), 'Oscar Piastri', '{"pace":92,"consistency":90,"tire_management":85,"ers_efficiency":85,"racecraft":88,"wet_skill":85}'::jsonb, 90, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Red Bull Racing'), 'Max Verstappen', '{"pace":97,"consistency":96,"tire_management":93,"ers_efficiency":93,"racecraft":97,"wet_skill":97}'::jsonb, 98, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Red Bull Racing'), 'Sergio Perez', '{"pace":90,"consistency":85,"tire_management":92,"ers_efficiency":90,"racecraft":85,"wet_skill":75}'::jsonb, 85, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Ferrari'), 'Charles Leclerc', '{"pace":94,"consistency":88,"tire_management":85,"ers_efficiency":88,"racecraft":92,"wet_skill":90}'::jsonb, 90, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Ferrari'), 'Carlos Sainz', '{"pace":92,"consistency":90,"tire_management":88,"ers_efficiency":88,"racecraft":90,"wet_skill":85}'::jsonb, 88, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Mercedes'), 'Lewis Hamilton', '{"pace":94,"consistency":95,"tire_management":98,"ers_efficiency":92,"racecraft":95,"wet_skill":95}'::jsonb, 90, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Mercedes'), 'George Russell', '{"pace":92,"consistency":88,"tire_management":85,"ers_efficiency":88,"racecraft":90,"wet_skill":88}'::jsonb, 85, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Aston Martin'), 'Fernando Alonso', '{"pace":93,"consistency":95,"tire_management":90,"ers_efficiency":88,"racecraft":98,"wet_skill":90}'::jsonb, 85, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Aston Martin'), 'Lance Stroll', '{"pace":82,"consistency":70,"tire_management":75,"ers_efficiency":80,"racecraft":80,"wet_skill":85}'::jsonb, 75, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Alpine'), 'Pierre Gasly', '{"pace":88,"consistency":85,"tire_management":85,"ers_efficiency":84,"racecraft":88,"wet_skill":92}'::jsonb, 80, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Alpine'), 'Esteban Ocon', '{"pace":88,"consistency":85,"tire_management":82,"ers_efficiency":84,"racecraft":90,"wet_skill":90}'::jsonb, 80, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Williams'), 'Alexander Albon', '{"pace":90,"consistency":88,"tire_management":90,"ers_efficiency":84,"racecraft":88,"wet_skill":85}'::jsonb, 85, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Williams'), 'Logan Sargeant', '{"pace":80,"consistency":70,"tire_management":75,"ers_efficiency":80,"racecraft":75,"wet_skill":70}'::jsonb, 70, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='RB'), 'Daniel Ricciardo', '{"pace":88,"consistency":85,"tire_management":88,"ers_efficiency":82,"racecraft":92,"wet_skill":85}'::jsonb, 85, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='RB'), 'Yuki Tsunoda', '{"pace":86,"consistency":80,"tire_management":80,"ers_efficiency":82,"racecraft":85,"wet_skill":82}'::jsonb, 85, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Sauber'), 'Valtteri Bottas', '{"pace":86,"consistency":92,"tire_management":90,"ers_efficiency":82,"racecraft":85,"wet_skill":80}'::jsonb, 80, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Sauber'), 'Guanyu Zhou', '{"pace":84,"consistency":85,"tire_management":85,"ers_efficiency":82,"racecraft":80,"wet_skill":90}'::jsonb, 80, '{}'::jsonb),

      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Haas'), 'Nico Hulkenberg', '{"pace":86,"consistency":88,"tire_management":80,"ers_efficiency":80,"racecraft":88,"wet_skill":90}'::jsonb, 85, '{}'::jsonb),
      ((SELECT id FROM public.tcc_teams WHERE championship_id=cid AND name='Haas'), 'Kevin Magnussen', '{"pace":84,"consistency":80,"tire_management":75,"ers_efficiency":78,"racecraft":90,"wet_skill":88}'::jsonb, 80, '{}'::jsonb);
  END IF;
END $$;
