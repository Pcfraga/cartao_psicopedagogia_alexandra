# Build context: backend/
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Cartao.slnx ./
COPY src/Cartao.Api/Cartao.Api.csproj src/Cartao.Api/
RUN dotnet restore src/Cartao.Api/Cartao.Api.csproj
COPY src/ src/
RUN dotnet publish src/Cartao.Api/Cartao.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
COPY --from=build /app .
USER $APP_UID
ENTRYPOINT ["dotnet", "Cartao.Api.dll"]
