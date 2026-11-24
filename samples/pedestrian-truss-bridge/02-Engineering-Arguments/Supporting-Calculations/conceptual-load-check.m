% conceptual-load-check.m
% FrameLytix educational sample - Pedestrian Truss Bridge (fictional project)
%
% NOTE: FrameLytix never executes this file. It is stored as a supporting document
% so that the hand calculations CALC-001 to CALC-005 can be reproduced in MATLAB or
% GNU Octave by the reader.
%
% ALL VALUES ARE ILLUSTRATIVE ASSUMPTIONS. NOT FOR CONSTRUCTION.
% The 4.0 kPa live load and 150 MPa allowable stress are NOT taken from any code.
% The governing code and limits must be confirmed by a qualified engineer.

clear; clc;

% ---- Inputs ---------------------------------------------------------------
q     = 4.0;      % kPa (kN/m^2)  illustrative pedestrian live load
b     = 2.5;      % m             clear deck width
L     = 24.0;     % m             clear span (6 panels x 4.0 m)
h     = 3.0;      % m             truss depth
sigma = 150;      % MPa (N/mm^2)  illustrative allowable stress

% ---- CALC-001: line load --------------------------------------------------
w = q * b;                 % kN/m

% ---- CALC-002: midspan moment (simply supported, UDL) ----------------------
Mmax = w * L^2 / 8;        % kN.m

% ---- CALC-003: support reaction -------------------------------------------
R = w * L / 2;             % kN

% ---- CALC-004: chord force from the moment couple --------------------------
% Simplification: whole-bridge moment resolved into one chord couple. The split
% between the two trusses is not considered in this conceptual check.
F = Mmax / h;              % kN

% ---- CALC-005: required chord area -----------------------------------------
Areq = (F * 1000) / sigma; % mm^2  (kN -> N, then N / (N/mm^2))

% ---- Report -----------------------------------------------------------------
fprintf('w      = %8.2f kN/m\n', w);
fprintf('Mmax   = %8.2f kN.m\n', Mmax);
fprintf('R      = %8.2f kN\n', R);
fprintf('F      = %8.2f kN\n', F);
fprintf('Areq   = %8.2f mm^2\n', Areq);
