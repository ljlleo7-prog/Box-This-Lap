-- Fix RLS for tcc_weekends
-- It seems we missed adding policies for this table

CREATE POLICY "Public can view weekends" ON tcc_weekends
    FOR SELECT USING (true);

CREATE POLICY "Hosts can manage weekends" ON tcc_weekends
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM tcc_championship_members 
            WHERE championship_id = tcc_weekends.championship_id 
            AND user_id = auth.uid() 
            AND role IN ('host', 'developer')
        )
    );
